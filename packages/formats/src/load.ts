import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { glob } from 'tinyglobby';
import { isStackable, stacksWith } from './component.js';
import { cartesian, componentIds, resolveRow, type Row } from './inventory.js';
import { LibraryLoader, tileChoices } from './library-loader.js';
import { byCodeUnit } from './order.js';
import { ProjectFiles } from './project-files.js';
import type { ComponentSpec, LoadResult, ResolvedSetup, ResolvedType } from './resolved.js';
import {
  InventoryFile,
  FORMAT_VERSION,
  LEGACY_FORMAT,
  LegacyInventoryFile,
  LegacyManifestFile,
  ManifestFile,
  SetupFile,
  type InventoryEntry,
  type Scalar,
} from './schemas.js';
import { stepProblems, type Known } from './setup-checks.js';
import type { SourceFile } from './source.js';
import { upgradeEntry, upgradeManifest, upgradeSetup } from './upgrade.js';

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
/** The assets file a project uses when its manifest names none. */
export const ASSETS_FILE = 'assets.yaml';

/** Loads and validates a project folder. Never throws for problems in the files. */
export async function loadProject(dir: string): Promise<LoadResult> {
  const loader = new ProjectLoader(path.resolve(dir));
  return loader.load();
}

/** Where an inventory entry's component id is: `component`, or `type` in the first format. */
type EntryKey = 'component' | 'type';

class ProjectLoader {
  private readonly files: ProjectFiles;
  private readonly library: LibraryLoader;
  private legacy = false;
  private components: ComponentSpec[] = [];
  private decks: Record<string, string[]> = {};
  private setups: Record<string, ResolvedSetup> = {};
  /** Decks that exist but are incomplete; setups that use them are not reported again. */
  private brokenDecks = new Set<string>();
  /** The components each deck holds so far, to check that they can share its stack. */
  private deckKinds: Record<string, ResolvedType[]> = {};
  private libraryFiles: string[] = [];

  constructor(private readonly dir: string) {
    this.files = new ProjectFiles(dir);
    this.library = new LibraryLoader(this.files);
  }

  private get diagnostics() {
    return this.files.diagnostics;
  }

  private get types(): Record<string, ResolvedType> {
    return this.library.types;
  }

  async load(): Promise<LoadResult> {
    const manifestSource = await this.files.read(MANIFEST_FILE);
    if (!manifestSource) return { diagnostics: this.diagnostics };
    const manifest = this.readManifest(manifestSource);
    if (!manifest) return { diagnostics: this.diagnostics };

    const libraryFiles = await this.files.expandGlobs(manifest.libraries, manifestSource, [
      'libraries',
    ]);
    this.libraryFiles = libraryFiles;
    if (this.legacy) await this.library.loadLegacy(libraryFiles);
    else
      await this.library.load(libraryFiles, await this.assetsFile(manifest.assets, manifestSource));

    await this.loadInventory(manifest.inventory, manifestSource);
    await this.loadSetups(manifest, manifestSource);

    const ok = !this.diagnostics.some((d) => d.severity === 'error');
    return {
      diagnostics: this.diagnostics,
      project: ok
        ? {
            dir: this.dir,
            manifest,
            legacy: this.legacy,
            libraries: this.libraryFiles,
            assets: this.library.assets,
            types: this.types,
            components: this.components,
            decks: this.decks,
            setups: this.setups,
          }
        : undefined,
    };
  }

  /** The manifest in the current format; one in the first format is converted. */
  private readManifest(source: SourceFile): ManifestFile | undefined {
    const format = (source.toJS() as { format?: unknown } | null)?.format;
    this.legacy = format === LEGACY_FORMAT;
    if (!this.legacy) {
      const { data, diagnostics } = source.validate(ManifestFile);
      this.diagnostics.push(...diagnostics);
      return data;
    }
    const { data, diagnostics } = source.validate(LegacyManifestFile);
    this.diagnostics.push(...diagnostics);
    this.diagnostics.push(
      source.diagnostic(
        ['format'],
        `This project is in ${LEGACY_FORMAT}. It plays as it is; run \`trayful migrate\` to move it to ${FORMAT_VERSION} before changing its components.`,
        'warning',
      ),
    );
    return data && upgradeManifest(data, undefined);
  }

  /** The assets file the manifest names, else `assets.yaml` when there is one. */
  private async assetsFile(
    named: string | undefined,
    manifest: SourceFile,
  ): Promise<string | undefined> {
    if (named === undefined)
      return (await this.files.exists(ASSETS_FILE)) ? ASSETS_FILE : undefined;
    if (await this.files.exists(named)) return named;
    this.diagnostics.push(manifest.diagnostic(['assets'], `Assets file "${named}" not found.`));
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  private async loadInventory(file: string, manifest: SourceFile): Promise<void> {
    if (!(await this.files.exists(file))) {
      this.diagnostics.push(
        manifest.diagnostic(['inventory'], `Inventory file "${file}" not found.`),
      );
      return;
    }
    const source = await this.files.read(file);
    if (!source) return;
    const entries = this.inventoryEntries(source);
    const key: EntryKey = this.legacy ? 'type' : 'component';
    const usedIds = new Set<string>();
    for (const [e, entry] of entries.entries()) {
      await this.loadEntry(entry, source, ['components', e, key], usedIds);
    }
  }

  private inventoryEntries(source: SourceFile): InventoryEntry[] {
    if (this.legacy) {
      const { data, diagnostics } = source.validate(LegacyInventoryFile);
      this.diagnostics.push(...diagnostics);
      return data?.components.map(upgradeEntry) ?? [];
    }
    const { data, diagnostics } = source.validate(InventoryFile);
    this.diagnostics.push(...diagnostics);
    return data?.components ?? [];
  }

  /** Loads one entry; `keyPath` is where the entry names its component. */
  private async loadEntry(
    entry: InventoryEntry,
    source: SourceFile,
    keyPath: (string | number)[],
    usedIds: Set<string>,
  ): Promise<void> {
    const entryPath = keyPath.slice(0, -1);
    const type = this.checkEntry(entry, source, keyPath);
    if (!type) return;
    const rows = await this.entryRows(entry, source, entryPath);
    const tiles = tileChoices(type, this.library.assets);
    for (const [r, row] of rows.entries()) {
      const resolved = resolveRow(type, entry, row, r);
      const tile = Number(resolved?.data.tile);
      const badTile = !!resolved && tiles !== undefined && (tile < 0 || tile >= tiles);
      if (badTile) row.report('tile', `"tile" must be from 0 to ${tiles - 1}.`);
      if (!resolved || badTile) {
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
   * Reports problems with an entry's component and keys, and marks the deck of an entry
   * with an unknown component as broken. Returns the component, unless it is unknown or
   * the entry mixes `items`, `from` and `each`, so there are no rows to load.
   */
  private checkEntry(
    entry: InventoryEntry,
    source: SourceFile,
    keyPath: (string | number)[],
  ): ResolvedType | undefined {
    const entryPath = keyPath.slice(0, -1);
    const report = (at: (string | number)[], message: string) =>
      this.diagnostics.push(source.diagnostic(at, message));
    const type = this.types[entry.component];
    if (!type) {
      if (entry.deck) this.brokenDecks.add(entry.deck);
      if (!this.library.brokenTypes.has(entry.component))
        report(keyPath, `Unknown component "${entry.component}". Define it in a library first.`);
      return undefined;
    }
    if (type.is === 'stamp') {
      if (entry.deck) this.brokenDecks.add(entry.deck);
      report(keyPath, `"${type.id}" is a stamp: it is pressed onto sheets, not kept in the box.`);
      return undefined;
    }
    const modes = (['items', 'from', 'each'] as const).filter((k) => entry[k] !== undefined);
    if (modes.length > 1) {
      report([...entryPath, modes[1]!], `Use only one of "items", "from" or "each" in an entry.`);
      return undefined;
    }
    // A deck that cannot stack is reported, but the rows are still checked, so their
    // problems show up in the same run.
    const problem = entry.deck ? this.deckProblem(entry.deck, type) : undefined;
    if (problem) report([...entryPath, 'deck'], problem);
    return type;
  }

  /** Why a component cannot join a deck: it does not stack, or not with what the deck holds. */
  private deckProblem(deck: string, type: ResolvedType): string | undefined {
    if (!isStackable(type)) return `"${type.id}" is not stackable, so it cannot be in a deck.`;
    const kinds = (this.deckKinds[deck] ??= []);
    const other = kinds.find((k) => !stacksWith(type, k));
    if (!kinds.includes(type)) kinds.push(type);
    if (!other) return undefined;
    return `"${type.id}" and "${other.id}" cannot share a stack, so they cannot be in one deck. List one in the other's "stackable.with".`;
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
          this.files.error(file, field ? `${message} (column "${field}")` : message, { line }),
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
      this.files.error(file, `Could not parse CSV: ${e.message}`, { line: e.lines });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Setups
  // -------------------------------------------------------------------------

  private async loadSetups(manifest: ManifestFile, manifestSource: SourceFile): Promise<void> {
    const setupFiles = manifest.setups
      ? await this.files.expandGlobs(manifest.setups, manifestSource, ['setups'])
      : await glob('setups/*.yaml', { cwd: this.dir, expandDirectories: false });
    const known = this.known();
    for (const file of setupFiles.toSorted(byCodeUnit)) await this.loadSetup(file, known);
    if (manifest.setup === undefined) return;
    const names = setupFiles.map((f) => path.basename(f).replace(/\.ya?ml$/, ''));
    if (!names.includes(manifest.setup)) {
      const list = names.length
        ? `Known setups: ${names.join(', ')}.`
        : 'There are no setup files.';
      this.diagnostics.push(
        manifestSource.diagnostic(['setup'], `Unknown setup "${manifest.setup}". ${list}`),
      );
    }
  }

  /** What setups may refer to. It shares the loader's collections, so it stays current. */
  private known(): Known {
    return {
      types: this.types,
      components: this.components,
      decks: this.decks,
      brokenTypes: this.library.brokenTypes,
      brokenDecks: this.brokenDecks,
    };
  }

  private async loadSetup(file: string, known: Known): Promise<void> {
    const source = await this.files.read(file);
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
    const setup = this.legacy ? upgradeSetup(data, this.library.boards) : data;
    this.setups[name] = { ...setup, file };
  }
}
