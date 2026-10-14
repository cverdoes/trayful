import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import fg from 'fast-glob';
import type { Diagnostic } from './diagnostics.js';
import {
  coerceValue,
  isTemplate,
  normalizeField,
  templateRefs,
  type NormalizedField,
} from './fields.js';
import { z } from 'zod';
import {
  ComponentType as ComponentTypeSchema,
  InventoryFile,
  LibraryFile,
  ManifestFile,
  PRIMITIVE_INFO,
  PRIMITIVES,
  SetupFile,
  type ComponentType,
  type Face,
  type Scalar,
  type SetupStep,
  type SnapTarget,
} from './schemas.js';
import { byCodeUnit } from './order.js';
import { SourceFile } from './source.js';

export const MANIFEST_FILE = 'trayful.yaml';

export interface ResolvedType extends ComponentType {
  /** Where the type is defined, for error messages. */
  source: { file: string; index: number };
  normalizedFields: Record<string, NormalizedField>;
}

/** One physical component, expanded from the inventory. */
export interface ComponentSpec {
  /** Stable id: `type`, `type.row` or `type.row.copy`, e.g. `action-card.harvest.2`. */
  id: string;
  type: string;
  data: Record<string, Scalar>;
  deck?: string;
}

export interface ResolvedSetup extends SetupFile {
  file: string;
}

export interface ResolvedProject {
  dir: string;
  manifest: ManifestFile;
  palette: Record<string, string>;
  types: Record<string, ResolvedType>;
  components: ComponentSpec[];
  /** Deck name to component ids, top of the deck first. */
  decks: Record<string, string[]>;
  /** Setup name (file name without extension, or its `name`) to setup. */
  setups: Record<string, ResolvedSetup>;
}

export interface LoadResult {
  /** Present when the project has no errors. */
  project?: ResolvedProject;
  diagnostics: Diagnostic[];
}

/** Loads and validates a project folder. Never throws for problems in the files. */
export async function loadProject(dir: string): Promise<LoadResult> {
  const loader = new ProjectLoader(path.resolve(dir));
  return loader.load();
}

class ProjectLoader {
  private diagnostics: Diagnostic[] = [];
  private types: Record<string, ResolvedType> = {};
  private palette: Record<string, string> = {};
  private components: ComponentSpec[] = [];
  private decks: Record<string, string[]> = {};
  private setups: Record<string, ResolvedSetup> = {};
  private sources = new Map<string, SourceFile>();
  /**
   * Ids of types and decks that exist but failed validation. References to them
   * are not reported again, so one typo produces one error instead of a cascade.
   */
  private brokenTypes = new Set<string>();
  private brokenDecks = new Set<string>();

  constructor(private readonly dir: string) {}

  async load(): Promise<LoadResult> {
    const manifestSource = await this.readSource(MANIFEST_FILE);
    if (!manifestSource) return { diagnostics: this.diagnostics };
    const { data: manifest, diagnostics } = manifestSource.validate(ManifestFile);
    this.diagnostics.push(...diagnostics);
    if (!manifest) return { diagnostics: this.diagnostics };

    const libraryFiles = await this.expandGlobs(manifest.libraries, manifestSource, ['libraries']);
    for (const file of libraryFiles) await this.loadLibrary(file);
    this.checkTypeReferences();
    await this.checkLibraryAssets();

    await this.loadInventory(manifest.inventory, manifestSource);

    const setupFiles = manifest.setups
      ? await this.expandGlobs(manifest.setups, manifestSource, ['setups'])
      : await fg('setups/*.yaml', { cwd: this.dir });
    for (const file of setupFiles.toSorted(byCodeUnit)) await this.loadSetup(file);
    if (manifest.setup !== undefined) {
      const names = setupFiles.map((f) => path.basename(f).replace(/\.ya?ml$/, ''));
      if (!names.includes(manifest.setup)) {
        const known = names.length
          ? `Known setups: ${names.join(', ')}.`
          : 'There are no setup files.';
        this.diagnostics.push(
          manifestSource.diagnostic(['setup'], `Unknown setup "${manifest.setup}". ${known}`),
        );
      }
    }

    const ok = !this.diagnostics.some((d) => d.severity === 'error');
    return {
      diagnostics: this.diagnostics,
      project: ok
        ? {
            dir: this.dir,
            manifest,
            palette: this.palette,
            types: this.types,
            components: this.components,
            decks: this.decks,
            setups: this.setups,
          }
        : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  private async readSource(file: string): Promise<SourceFile | undefined> {
    try {
      const source = await SourceFile.read(path.join(this.dir, file), file);
      this.sources.set(file, source);
      return source;
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      this.error(
        file,
        missing ? 'File not found.' : `Could not read file: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  private async expandGlobs(
    patterns: string[],
    source: SourceFile,
    path_: (string | number)[],
  ): Promise<string[]> {
    const files: string[] = [];
    for (const [i, pattern] of patterns.entries()) {
      const matches = await this.matchPattern(pattern);
      if (matches.length === 0) {
        this.diagnostics.push(source.diagnostic([...path_, i], `No files match "${pattern}".`));
      }
      files.push(...matches.toSorted(byCodeUnit));
    }
    return [...new Set(files)];
  }

  private async matchPattern(pattern: string): Promise<string[]> {
    if (fg.isDynamicPattern(pattern)) return fg(pattern, { cwd: this.dir });
    return (await this.exists(pattern)) ? [pattern] : [];
  }

  private async exists(file: string): Promise<boolean> {
    try {
      await access(path.join(this.dir, file));
      return true;
    } catch {
      return false;
    }
  }

  private error(file: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.diagnostics.push({ severity: 'error', file, message, ...extra });
  }

  // -------------------------------------------------------------------------
  // Libraries
  // -------------------------------------------------------------------------

  private async loadLibrary(file: string): Promise<void> {
    const source = await this.readSource(file);
    if (!source) return;
    // Validate the envelope first, then each type on its own, so one broken
    // type does not hide the others.
    const envelope = LibraryFile.extend({ types: z.array(z.unknown()) });
    const { data, diagnostics } = source.validate(envelope);
    this.diagnostics.push(...diagnostics);
    if (!data) return;

    for (const [name, color] of Object.entries(data.palette ?? {})) {
      if (this.palette[name] !== undefined && this.palette[name] !== color) {
        this.diagnostics.push(
          source.diagnostic(
            ['palette', name],
            `Palette colour "${name}" is already defined with a different value.`,
            'warning',
          ),
        );
      }
      this.palette[name] = color;
    }

    for (const [index, raw] of data.types.entries()) {
      const at = (...p: (string | number)[]) => ['types', index, ...p];
      const { data: type, diagnostics: typeProblems } = source.validateValue(
        ComponentTypeSchema,
        raw,
        at(),
      );
      this.diagnostics.push(...typeProblems);
      if (!type) {
        const id = (raw as { id?: unknown } | null)?.id;
        if (typeof id === 'string') this.brokenTypes.add(id);
        continue;
      }
      const existing = this.types[type.id];
      if (existing) {
        this.diagnostics.push(
          source.diagnostic(
            at('id'),
            `Type "${type.id}" is already defined in ${existing.source.file}.`,
          ),
        );
        continue;
      }
      const normalizedFields = Object.fromEntries(
        Object.entries(type.fields ?? {}).map(([k, f]) => [k, normalizeField(f)]),
      );
      this.types[type.id] = { ...type, source: { file, index }, normalizedFields };
      this.checkType(type, normalizedFields, source, at);
    }
  }

  private checkType(
    type: ComponentType,
    fields: Record<string, NormalizedField>,
    source: SourceFile,
    at: (...p: (string | number)[]) => (string | number)[],
  ): void {
    const info = PRIMITIVE_INFO[type.base];
    const report = (p: (string | number)[], message: string) =>
      this.diagnostics.push(source.diagnostic(p, message));

    if (type.back && info.sides === 1)
      report(at('back'), `A ${type.base} has one side, so it cannot have a "back".`);
    if (type.snap && !info.snapTargets)
      report(at('snap'), `Only boards, tiles and zones can have snap targets.`);
    if (type.range && type.base !== 'counter') report(at('range'), `"range" is only for counters.`);
    if (type.faces && type.base !== 'die') report(at('faces'), `"faces" is only for dice.`);
    if (type.range && type.range[0] > type.range[1])
      report(at('range'), `The minimum is larger than the maximum.`);
    if (type.fill && type.front?.fill)
      report(at('fill'), `Use either "fill" or "front.fill", not both.`);

    for (const [name, field] of Object.entries(fields)) {
      if (field.default === undefined) continue;
      const result = coerceValue(field, field.default, false);
      if ('error' in result)
        report(at('fields', name, 'default'), `Default value ${result.error}.`);
    }

    const snapIds = new Set<string>();
    for (const [i, target] of (type.snap ?? []).entries()) {
      const kinds = [target.grid, target.points, target.area].filter(Boolean).length;
      if (kinds !== 1) report(at('snap', i), `Give exactly one of "grid", "points" or "area".`);
      if (snapIds.has(target.id))
        report(at('snap', i, 'id'), `Snap target "${target.id}" is defined twice.`);
      snapIds.add(target.id);
    }

    // Every {{field}} used in a face must be a declared field.
    const check = (text: string | undefined, p: (string | number)[]) => {
      if (!text) return;
      for (const ref of templateRefs(text)) {
        if (!fields[ref]) report(p, `"{{${ref}}}" is not a field of "${type.id}".`);
      }
    };
    check(type.fill, at('fill'));
    for (const side of ['front', 'back'] as const) {
      const face: Face | undefined = type[side];
      if (!face) continue;
      check(face.fill, at(side, 'fill'));
      check(face.stroke, at(side, 'stroke'));
      for (const [i, layer] of (face.layers ?? []).entries()) {
        const lp = (k: string) => at(side, 'layers', i, k);
        if ('text' in layer) check(layer.text, lp('text'));
        if ('image' in layer) check(layer.image, lp('image'));
        if ('color' in layer) check(layer.color, lp('color'));
        if ('fill' in layer) check(layer.fill, lp('fill'));
        if ('stroke' in layer) check(layer.stroke, lp('stroke'));
        check(layer.when, lp('when'));
      }
    }
  }

  /** `accepts` lists must name known types or primitives. Runs once all libraries are loaded. */
  private checkTypeReferences(): void {
    for (const type of Object.values(this.types)) {
      const source = this.sources.get(type.source.file)!;
      for (const [i, target] of (type.snap ?? []).entries()) {
        for (const [j, name] of (target.accepts ?? []).entries()) {
          if (this.brokenTypes.has(name)) continue;
          if (!this.types[name] && !(PRIMITIVES as readonly string[]).includes(name)) {
            this.diagnostics.push(
              source.diagnostic(
                ['types', type.source.index, 'snap', i, 'accepts', j],
                `"${name}" is neither a type id nor a primitive (${PRIMITIVES.join(', ')}).`,
              ),
            );
          }
        }
      }
    }
  }

  /** Image paths written directly in a library (not via a field) must exist. */
  private async checkLibraryAssets(): Promise<void> {
    for (const type of Object.values(this.types)) {
      const source = this.sources.get(type.source.file)!;
      for (const side of ['front', 'back'] as const) {
        for (const [i, layer] of (type[side]?.layers ?? []).entries()) {
          if (!('image' in layer) || isTemplate(layer.image)) continue;
          if (!(await this.exists(layer.image))) {
            this.diagnostics.push(
              source.diagnostic(
                ['types', type.source.index, side, 'layers', i, 'image'],
                `Image "${layer.image}" not found in the project folder.`,
              ),
            );
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  private async loadInventory(file: string, manifest: SourceFile): Promise<void> {
    if (!(await this.exists(file))) {
      this.diagnostics.push(
        manifest.diagnostic(['inventory'], `Inventory file "${file}" not found.`),
      );
      return;
    }
    const source = await this.readSource(file);
    if (!source) return;
    const { data, diagnostics } = source.validate(InventoryFile);
    this.diagnostics.push(...diagnostics);
    if (!data) return;

    const usedIds = new Set<string>();
    for (const [e, entry] of data.components.entries()) {
      const at = (...p: (string | number)[]) => ['components', e, ...p];
      const report = (p: (string | number)[], message: string) =>
        this.diagnostics.push(source.diagnostic(p, message));

      const type = this.types[entry.type];
      if (!type) {
        if (entry.deck) this.brokenDecks.add(entry.deck);
        if (this.brokenTypes.has(entry.type)) continue;
        report(at('type'), `Unknown type "${entry.type}". Define it in a library first.`);
        continue;
      }
      const modes = (['items', 'from', 'each'] as const).filter((k) => entry[k] !== undefined);
      if (modes.length > 1) {
        report(at(modes[1]!), `Use only one of "items", "from" or "each" in an entry.`);
        continue;
      }
      if (entry.deck && !PRIMITIVE_INFO[type.base].stackable) {
        report(at('deck'), `A ${type.base} cannot be stacked into a deck.`);
      }

      // Collect raw rows, each with a way to report problems against its source.
      interface Row {
        values: Record<string, Scalar>;
        fromText: boolean;
        report: (field: string | undefined, message: string) => void;
        key: string | undefined;
      }
      const rows: Row[] = [];
      if (entry.items) {
        for (const [r, item] of entry.items.entries()) {
          rows.push({
            values: item,
            fromText: false,
            key: undefined,
            report: (field, message) =>
              report(field ? at('items', r, field) : at('items', r), message),
          });
        }
      } else if (entry.from) {
        const csvRows = await this.readCsv(entry.from, source, at('from'));
        for (const row of csvRows) {
          rows.push({
            values: row.values,
            fromText: true,
            key: undefined,
            report: (field, message) =>
              this.error(entry.from!, field ? `${message} (column "${field}")` : message, {
                line: row.line,
              }),
          });
        }
      } else if (entry.each) {
        for (const combo of cartesian(entry.each)) {
          rows.push({
            values: combo,
            fromText: false,
            key: Object.values(combo).map(String).join('-'),
            report: (field, message) => report(field ? at('each', field) : at('each'), message),
          });
        }
      } else {
        rows.push({
          values: {},
          fromText: false,
          key: '',
          report: (_f, message) => report(at(), message),
        });
      }

      for (const [r, row] of rows.entries()) {
        const { count: rowCount, id: rowId, ...values } = row.values;
        const merged: Record<string, Scalar> = {};
        for (const [name, field] of Object.entries(type.normalizedFields)) {
          if (field.default !== undefined) merged[name] = field.default;
        }
        Object.assign(merged, entry.data ?? {});
        let rowOk = true;
        const invalid = new Set<string>();
        for (const [name, raw] of Object.entries(values)) {
          if (row.fromText && raw === '') continue;
          const field = type.normalizedFields[name];
          if (!field) {
            row.report(name, `"${name}" is not a field of "${type.id}".`);
            rowOk = false;
            continue;
          }
          const result = coerceValue(field, raw, row.fromText);
          if ('error' in result) {
            row.report(name, `"${name}" ${result.error}.`);
            invalid.add(name);
            rowOk = false;
          } else merged[name] = result.value;
        }
        for (const [name, field] of Object.entries(type.normalizedFields)) {
          if (merged[name] === undefined && !field.optional && !invalid.has(name)) {
            row.report(undefined, `Missing value for field "${name}".`);
            rowOk = false;
          }
        }
        let count = entry.count ?? 1;
        if (rowCount !== undefined && !(row.fromText && rowCount === '')) {
          const n = Number(rowCount);
          if (!Number.isInteger(n) || n < 1) {
            row.report('count', `"count" must be a whole number of at least 1.`);
            rowOk = false;
          } else count = n;
        }
        if (!rowOk) {
          if (entry.deck) this.brokenDecks.add(entry.deck);
          continue;
        }

        const key =
          rowId !== undefined && rowId !== ''
            ? slugify(String(rowId))
            : (row.key ?? rowKey(merged, r));
        const baseId = key ? `${type.id}.${key}` : type.id;
        for (let copy = 1; copy <= count; copy++) {
          const id = unusedId(count > 1 ? `${baseId}.${copy}` : baseId, usedIds);
          usedIds.add(id);
          const spec: ComponentSpec = { id, type: type.id, data: { ...merged } };
          if (entry.deck) {
            spec.deck = entry.deck;
            const deck = this.decks[entry.deck] ?? [];
            deck.push(id);
            this.decks[entry.deck] = deck;
          }
          this.components.push(spec);
        }
      }
    }
  }

  private async readCsv(
    file: string,
    inventory: SourceFile,
    at: (string | number)[],
  ): Promise<{ values: Record<string, string>; line: number }[]> {
    let text: string;
    try {
      text = await readFile(path.join(this.dir, file), 'utf8');
    } catch {
      this.diagnostics.push(inventory.diagnostic(at, `CSV file "${file}" not found.`));
      return [];
    }
    try {
      const records = parseCsv<{ record: Record<string, string>; info: { lines: number } }>(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        info: true,
      });
      return records.map((r) => ({ values: r.record, line: r.info.lines }));
    } catch (err) {
      const e = err as Error & { lines?: number };
      this.error(file, `Could not parse CSV: ${e.message}`, { line: e.lines });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Setups
  // -------------------------------------------------------------------------

  private async loadSetup(file: string): Promise<void> {
    const source = await this.readSource(file);
    if (!source) return;
    const { data, diagnostics } = source.validate(SetupFile);
    this.diagnostics.push(...diagnostics);
    if (!data) return;
    const name = path.basename(file).replace(/\.ya?ml$/, '');
    for (const [i, step] of data.steps.entries()) this.checkStep(step, source, ['steps', i]);
    this.setups[name] = { ...data, file };
  }

  private checkStep(step: SetupStep, source: SourceFile, at: (string | number)[]): void {
    const report = (p: (string | number)[], message: string) =>
      this.diagnostics.push(source.diagnostic([...at, ...p], message));
    const checkDeck = (name: string, p: (string | number)[]) => {
      if (!this.decks[name] && !this.brokenDecks.has(name)) report(p, `Unknown deck "${name}".`);
    };
    if ('place' in step) {
      const ref = step.place;
      if (typeof ref === 'string') {
        const known =
          this.types[ref] !== undefined ||
          this.brokenTypes.has(ref) ||
          this.components.some((c) => c.id === ref);
        if (!known) report(['place'], `"${ref}" is neither a type id nor a component id.`);
        if (step.shuffle) report(['shuffle'], `Only a deck can be shuffled.`);
      } else {
        checkDeck(ref.deck, ['place', 'deck']);
      }
      if (typeof step.at === 'string') this.checkTarget(step.at, (m) => report(['at'], m));
    } else if ('deal' in step) {
      checkDeck(step.deal.from, ['deal', 'from']);
      if (typeof step.deal.to === 'string')
        this.checkTarget(step.deal.to, (m) => report(['deal', 'to'], m));
    } else {
      checkDeck(step.shuffle, ['shuffle']);
    }
  }

  /** Checks a `piece/target[/index]` reference, where piece is a component id or a type with one component. */
  private checkTarget(ref: string, report: (message: string) => void): void {
    const [owner, targetId, index, ...rest] = ref.split('/');
    if (!owner || !targetId || rest.length > 0) {
      report(`"${ref}" should look like "board/target" or "board/target/index".`);
      return;
    }
    const component = this.components.find((c) => c.id === owner);
    const ofType = this.components.filter((c) => c.type === owner);
    const typeId = component?.type ?? (ofType.length > 0 ? owner : undefined);
    if (!typeId) {
      if (this.brokenTypes.has(owner)) return;
      report(`"${owner}" is not a component id or a type in the inventory.`);
      return;
    }
    if (!component && ofType.length > 1) {
      report(
        `There are ${ofType.length} components of type "${owner}"; use a component id such as "${ofType[0]!.id}".`,
      );
      return;
    }
    const target = this.types[typeId]?.snap?.find((t) => t.id === targetId);
    if (!target) {
      report(`"${typeId}" has no snap target "${targetId}".`);
      return;
    }
    if (index !== undefined) {
      const spots = snapSpotCount(target);
      const i = Number(index);
      if (spots === undefined)
        report(`Snap target "${targetId}" is an area and has no numbered spots.`);
      else if (!Number.isInteger(i) || i < 0 || i >= spots) {
        report(`Spot ${index} is out of range; "${targetId}" has spots 0 to ${spots - 1}.`);
      }
    }
  }
}

/** Number of numbered spots in a snap target, or undefined for free areas. */
export function snapSpotCount(target: SnapTarget): number | undefined {
  if (target.grid) return target.grid.cols * target.grid.rows;
  if (target.points) return target.points.length;
  return undefined;
}

function cartesian(each: Record<string, Scalar[]>): Record<string, Scalar>[] {
  let combos: Record<string, Scalar>[] = [{}];
  for (const [key, values] of Object.entries(each)) {
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
  }
  return combos;
}

/** `base`, or `base~2`, `base~3`… when that id is already taken. */
function unusedId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}~${n}`;
    n++;
  }
  return id;
}

/** A readable row key: the first text field's value (usually the name), else the row number. */
function rowKey(data: Record<string, Scalar>, index: number): string {
  const text =
    typeof data.name === 'string' && slugify(data.name) !== ''
      ? data.name
      : Object.values(data).find((v) => typeof v === 'string' && slugify(v) !== '');
  return typeof text === 'string' ? slugify(text) : String(index + 1);
}

/** Runs of other characters become one dash, so trimming one dash at each end is enough. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
