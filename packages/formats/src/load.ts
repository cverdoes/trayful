import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import fg from 'fast-glob';
import type { Diagnostic } from './diagnostics.js';
import { isTemplate, normalizeField } from './fields.js';
import { z } from 'zod';
import {
  ComponentType as ComponentTypeSchema,
  InventoryFile,
  LibraryFile,
  ManifestFile,
  PRIMITIVE_INFO,
  PRIMITIVES,
  SetupFile,
  type InventoryEntry,
  type Scalar,
} from './schemas.js';
import { cartesian, componentIds, resolveRow, type Row } from './inventory.js';
import { byCodeUnit } from './order.js';
import type { ComponentSpec, LoadResult, ResolvedSetup, ResolvedType } from './resolved.js';
import { stepProblems, type Known } from './setup-checks.js';
import { SourceFile } from './source.js';
import { typeProblems } from './type-checks.js';

export type {
  ComponentSpec,
  LoadResult,
  ResolvedProject,
  ResolvedSetup,
  ResolvedType,
} from './resolved.js';
export { slugify } from './inventory.js';
export { snapSpotCount } from './setup-checks.js';

export const MANIFEST_FILE = 'trayful.yaml';

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
    const known = this.known();
    for (const file of setupFiles.toSorted(byCodeUnit)) await this.loadSetup(file, known);
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

    this.mergePalette(data.palette ?? {}, source);
    for (const [index, raw] of data.types.entries()) this.loadType(raw, file, index, source);
  }

  private mergePalette(palette: Record<string, string>, source: SourceFile): void {
    for (const [name, color] of Object.entries(palette)) {
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
  }

  private loadType(raw: unknown, file: string, index: number, source: SourceFile): void {
    const at = (...p: (string | number)[]) => ['types', index, ...p];
    const { data: type, diagnostics } = source.validateValue(ComponentTypeSchema, raw, at());
    this.diagnostics.push(...diagnostics);
    if (!type) {
      const id = (raw as { id?: unknown } | null)?.id;
      if (typeof id === 'string') this.brokenTypes.add(id);
      return;
    }
    const existing = this.types[type.id];
    if (existing) {
      this.diagnostics.push(
        source.diagnostic(
          at('id'),
          `Type "${type.id}" is already defined in ${existing.source.file}.`,
        ),
      );
      return;
    }
    const normalizedFields = Object.fromEntries(
      Object.entries(type.fields ?? {}).map(([k, f]) => [k, normalizeField(f)]),
    );
    this.types[type.id] = { ...type, source: { file, index }, normalizedFields };
    for (const problem of typeProblems(type, normalizedFields)) {
      this.diagnostics.push(source.diagnostic(at(...problem.path), problem.message));
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
      await this.loadEntry(entry, source, ['components', e], usedIds);
    }
  }

  private async loadEntry(
    entry: InventoryEntry,
    source: SourceFile,
    entryPath: (string | number)[],
    usedIds: Set<string>,
  ): Promise<void> {
    const type = this.checkEntry(entry, source, entryPath);
    if (!type) return;
    const rows = await this.entryRows(entry, source, entryPath);
    for (const [r, row] of rows.entries()) {
      const resolved = resolveRow(type, entry, row, r);
      if (!resolved) {
        if (entry.deck) this.brokenDecks.add(entry.deck);
        continue;
      }
      const baseId = resolved.key ? `${type.id}.${resolved.key}` : type.id;
      for (const id of componentIds(baseId, resolved.count, usedIds)) {
        this.addComponent(id, type.id, resolved.data, entry.deck);
      }
    }
  }

  /**
   * Reports problems with an entry's type and keys, and marks the deck of an entry with an
   * unknown type as broken. Returns the type, unless it is unknown or the entry mixes
   * `items`, `from` and `each`, so there are no rows to load.
   */
  private checkEntry(
    entry: InventoryEntry,
    source: SourceFile,
    entryPath: (string | number)[],
  ): ResolvedType | undefined {
    const report = (key: string, message: string) =>
      this.diagnostics.push(source.diagnostic([...entryPath, key], message));
    const type = this.types[entry.type];
    if (!type) {
      // Its deck is incomplete, so setups that use it are not reported again.
      if (entry.deck) this.brokenDecks.add(entry.deck);
      if (!this.brokenTypes.has(entry.type))
        report('type', `Unknown type "${entry.type}". Define it in a library first.`);
      return undefined;
    }
    const modes = (['items', 'from', 'each'] as const).filter((k) => entry[k] !== undefined);
    if (modes.length > 1) {
      report(modes[1]!, `Use only one of "items", "from" or "each" in an entry.`);
      return undefined;
    }
    // A deck that cannot stack is reported, but the rows are still checked, so their
    // problems show up in the same run.
    if (entry.deck && !PRIMITIVE_INFO[type.base].stackable) {
      report('deck', `A ${type.base} cannot be stacked into a deck.`);
    }
    return type;
  }

  /** The entry's designs, each with a way to report problems against where it came from. */
  private async entryRows(
    entry: InventoryEntry,
    source: SourceFile,
    entryPath: (string | number)[],
  ): Promise<Row[]> {
    const report = (p: (string | number)[], message: string) =>
      this.diagnostics.push(source.diagnostic([...entryPath, ...p], message));
    const under = (p: (string | number)[], field: string | undefined) =>
      field ? [...p, field] : p;
    if (entry.items) {
      return entry.items.map((values, r) => ({
        values,
        fromText: false,
        key: undefined,
        report: (field, message) => report(under(['items', r], field), message),
      }));
    }
    if (entry.from) {
      const file = entry.from;
      const csvRows = await this.readCsv(file, source, [...entryPath, 'from']);
      return csvRows.map(({ values, line }) => ({
        values,
        fromText: true,
        key: undefined,
        report: (field, message) =>
          this.error(file, field ? `${message} (column "${field}")` : message, { line }),
      }));
    }
    if (entry.each) {
      return cartesian(entry.each).map((values) => ({
        values,
        fromText: false,
        key: Object.values(values).map(String).join('-'),
        report: (field, message) => report(under(['each'], field), message),
      }));
    }
    return [{ values: {}, fromText: false, key: '', report: (_f, message) => report([], message) }];
  }

  private addComponent(
    id: string,
    type: string,
    data: Record<string, Scalar>,
    deck: string | undefined,
  ): void {
    this.components.push({ id, type, data: { ...data }, ...(deck ? { deck } : {}) });
    if (!deck) return;
    const ids = this.decks[deck] ?? [];
    ids.push(id);
    this.decks[deck] = ids;
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

  /** What setups may refer to. It shares the loader's collections, so it stays current. */
  private known(): Known {
    return {
      types: this.types,
      components: this.components,
      decks: this.decks,
      brokenTypes: this.brokenTypes,
      brokenDecks: this.brokenDecks,
    };
  }

  private async loadSetup(file: string, known: Known): Promise<void> {
    const source = await this.readSource(file);
    if (!source) return;
    const { data, diagnostics } = source.validate(SetupFile);
    this.diagnostics.push(...diagnostics);
    if (!data) return;
    const name = path.basename(file).replace(/\.ya?ml$/, '');
    for (const [i, step] of data.steps.entries()) {
      for (const problem of stepProblems(step, known)) {
        this.diagnostics.push(source.diagnostic(['steps', i, ...problem.path], problem.message));
      }
    }
    this.setups[name] = { ...data, file };
  }
}
