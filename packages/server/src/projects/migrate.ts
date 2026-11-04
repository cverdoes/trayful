import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ASSETS_FILE,
  AssetCollector,
  FORMAT_VERSION,
  LEGACY_FORMAT,
  LegacyLibraryFile,
  LegacyManifestFile,
  MANIFEST_FILE,
  SetupFile,
  formatDiagnostic,
  loadProject,
  typesByBase,
  upgradeManifest,
  upgradeSetup,
  upgradeType,
  type LegacyComponentType,
  type ResolvedProject,
} from '@trayful/formats';
import { isMap, isScalar, isSeq, visit, type Document, type YAMLMap } from 'yaml';
import { AuthoringError } from './authoring.js';
import { createNode, parseYaml, patchNode, yamlText } from './yaml-patch.js';

/** A project that cannot be migrated: already current, or with problems to fix first. */
export class MigrateError extends AuthoringError {}

/**
 * Rewrites a project in the first file format (`trayful/1`) in the current one. Every
 * library is rewritten, images and palette colours move to a new assets file, inventory
 * entries name their `component`, and setups lock the boards they place, as old boards
 * were. The manifest, inventory and setups are edited in place, so their comments stay;
 * libraries are written afresh, keeping only the comment lines at their top.
 * Returns the files written.
 */
export async function migrateFolder(dir: string): Promise<string[]> {
  const manifestText = await readFile(path.join(dir, MANIFEST_FILE), 'utf8');
  const manifestDoc = parseYaml(manifestText);
  const format = (manifestDoc.toJS() as { format?: unknown } | null)?.format;
  if (format === FORMAT_VERSION)
    throw new MigrateError(`This project is already in ${FORMAT_VERSION}.`);
  if (format !== LEGACY_FORMAT) {
    throw new MigrateError(
      `This project is not in ${LEGACY_FORMAT}, so there is nothing to migrate.`,
    );
  }
  const project = await loadable(dir, 'Fix these problems first:');
  const manifest = LegacyManifestFile.parse(manifestDoc.toJS());
  const files = await libraryFilesOf(dir, project.libraries);
  const assetsFile = freeName(dir, ASSETS_FILE);
  const { assets, boards } = files;
  if (assets)
    files.text.set(assetsFile, schemaHint(manifestText) + yamlText(tidy(styled({ ...assets }))));

  patchNode(manifestDoc, manifestDoc.contents, upgradeManifest(manifest, assets && assetsFile));
  files.text.set(MANIFEST_FILE, yamlText(manifestDoc));
  files.text.set(project.manifest.inventory, await inventoryText(dir, project.manifest.inventory));
  for (const setup of Object.values(project.setups)) {
    const text = await setupText(dir, setup.file, boards);
    if (text !== undefined) files.text.set(setup.file, text);
  }
  await writeChecked(dir, files.text);
  return [...files.text.keys()];
}

/** The project as it loads, or a MigrateError listing its problems. */
async function loadable(dir: string, intro: string): Promise<ResolvedProject> {
  const loaded = await loadProject(dir);
  if (loaded.project) return loaded.project;
  const problems = loaded.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
  throw new MigrateError(`${intro}\n  ${problems.join('\n  ')}`);
}

/**
 * Every library rewritten, including those that define nothing, with the images
 * and palette colours they used gathered for the assets file, and the boards
 * among their types.
 */
async function libraryFilesOf(dir: string, files: string[]) {
  const collector = new AssetCollector();
  const libraries = await readLibraries(dir, files);
  const all = libraries.flatMap((l) => l.types);
  const bases = typesByBase(all);
  const text = new Map<string, string>();
  for (const library of libraries) {
    collector.palette(library.palette);
    const components = library.types.map((t) => upgradeType(t, collector, bases));
    text.set(library.file, libraryText(library.header, components));
  }
  const boards = new Set(all.filter((t) => t.base === 'board').map((t) => t.id));
  return { text, assets: collector.file(), boards };
}

/**
 * Writes the files, then loads the project; if it does not load, every file is put
 * back as it was, so a failed migration leaves the project as it found it.
 */
async function writeChecked(dir: string, files: Map<string, string>): Promise<void> {
  const before = new Map<string, string | undefined>();
  for (const file of files.keys()) {
    const full = path.join(dir, file);
    before.set(file, existsSync(full) ? await readFile(full, 'utf8') : undefined);
  }
  for (const [file, text] of files) await writeFile(path.join(dir, file), text);
  try {
    await loadable(dir, 'The migrated project did not load, so its files were put back:');
  } catch (err) {
    for (const [file, text] of before) {
      const full = path.join(dir, file);
      await (text === undefined ? rm(full) : writeFile(full, text));
    }
    throw err;
  }
}

interface OldLibrary {
  file: string;
  /** Comment lines at the top of the file, such as the editor's schema hint. */
  header: string;
  palette?: Record<string, string>;
  types: LegacyComponentType[];
}

async function readLibraries(dir: string, files: string[]): Promise<OldLibrary[]> {
  const libraries: OldLibrary[] = [];
  for (const file of files) {
    const text = await readFile(path.join(dir, file), 'utf8');
    const data = LegacyLibraryFile.parse(parseYaml(text).toJS());
    const header = /^(?:#.*\n)*/.exec(text)![0];
    libraries.push({ file, header, palette: data.palette, types: data.types });
  }
  return libraries;
}

function libraryText(header: string, components: unknown[]): string {
  return header + yamlText(tidy(styled({ kind: 'library', components })));
}

/** A new document holding `value`. */
function styled(value: unknown): Document {
  const doc = parseYaml('{}\n');
  doc.contents = createNode(doc, value) as typeof doc.contents;
  return doc;
}

/** Maps that keep their keys on separate lines, however short. */
const BLOCK_KEYS = new Set(['fields', 'face', 'flippable', 'back', 'images', 'colors']);

/**
 * Writes short maps of plain values on one line, as people write these files
 * (`{ text: '{{name}}', at: [5, 5] }`), leaving components and the larger
 * sections of a component as blocks.
 */
function tidy(doc: Document): Document {
  visit(doc, {
    Map: (key, map, path) => {
      const parent = path.at(-1);
      const owner = isScalar(parent) ? undefined : (parent as { key?: unknown } | undefined)?.key;
      const name = isScalar(owner) ? String(owner.value) : undefined;
      const component = isSeq(parent) && isComponentList(path);
      if (component || (name && BLOCK_KEYS.has(name)) || key === null) return;
      if (map.items.length <= 6 && map.items.every((p) => isPlain(p.value))) map.flow = true;
    },
  });
  return doc;
}

function isComponentList(path: readonly unknown[]): boolean {
  const pair = path.at(-2) as { key?: unknown } | undefined;
  return isScalar(pair?.key) && pair.key.value === 'components';
}

function isPlain(node: unknown): boolean {
  return isScalar(node) || ((isSeq(node) || isMap(node)) && (node as YAMLMap).flow === true);
}

/**
 * The editor hint for the new assets file, pointing where the manifest's points: both
 * files sit in the project's top folder.
 */
function schemaHint(manifest: string): string {
  const hint = /^# yaml-language-server: \$schema=(.*)manifest\.schema\.json$/m.exec(manifest);
  return hint ? `# yaml-language-server: $schema=${hint[1]}assets.schema.json\n` : '';
}

/** `assets.yaml`, or `assets-2.yaml`… when the project already has that file. */
function freeName(dir: string, file: string): string {
  const ext = path.extname(file);
  const stem = file.slice(0, -ext.length);
  const named = (n: number) => (n === 1 ? file : `${stem}-${n}${ext}`);
  let n = 1;
  while (existsSync(path.join(dir, named(n)))) n++;
  return named(n);
}

/** The inventory with each entry's `type` key renamed to `component`, in place. */
async function inventoryText(dir: string, file: string): Promise<string> {
  const doc = parseYaml(await readFile(path.join(dir, file), 'utf8'));
  const entries = doc.get('components', true);
  for (const entry of isSeq(entries) ? entries.items : []) {
    const pair = isMap(entry)
      ? entry.items.find((p) => isScalar(p.key) && p.key.value === 'type')
      : undefined;
    if (pair && isScalar(pair.key)) pair.key.value = 'component';
  }
  return yamlText(doc);
}

/** The setup with `lock: true` on steps that place a board, or undefined when none do. */
async function setupText(
  dir: string,
  file: string,
  boards: ReadonlySet<string>,
): Promise<string | undefined> {
  const doc = parseYaml(await readFile(path.join(dir, file), 'utf8'));
  const setup = SetupFile.parse(doc.toJS());
  const upgraded = upgradeSetup(setup, boards);
  const steps = doc.get('steps', true);
  if (!isSeq(steps)) return undefined;
  const changed = upgraded.steps.flatMap((step, i) => (step === setup.steps[i] ? [] : [i]));
  for (const i of changed) patchNode(doc, steps.items[i], upgraded.steps[i]);
  return changed.length ? yamlText(doc) : undefined;
}
