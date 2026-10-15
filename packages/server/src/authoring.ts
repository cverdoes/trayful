import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ComponentType,
  InventoryEntry,
  flattenIssues,
  formatPath,
  type ResolvedProject,
} from '@trayful/formats';
import { isMap, isSeq, type Document, type YAMLSeq } from 'yaml';
import type { Workspace } from './workspace.js';
import { createNode, parseYaml, patchNode, yamlText } from './yaml-patch.js';

/**
 * Edits to a project's files on behalf of an agent. Every edit is checked by
 * reloading the project; if the files no longer load, the edit is undone and the
 * problems are reported, so a project never ends up broken by a tool call.
 * Comments and formatting elsewhere in the YAML files are kept.
 */
export class AuthoringError extends Error {}

/** A file changed on disk after the editor read it, so saving would overwrite someone's work. */
export class ConflictError extends AuthoringError {}

const ASSET_FILE = /\.(svg|png|jpe?g|gif|webp|csv)$/i;

export interface FileChange {
  /** Path relative to the project folder. */
  file: string;
  /** New contents, or null to delete the file. */
  content: string | Buffer | null;
}

/** Applies file changes, reloads the project and rolls back if it no longer loads. */
export async function commit(workspace: Workspace, projectId: string, changes: FileChange[]) {
  const entry = workspace.entry(projectId);
  const before: FileChange[] = [];
  for (const change of changes) {
    const full = inside(entry.dir, change.file);
    before.push({ file: change.file, content: existsSync(full) ? await readFile(full) : null });
  }
  await write(entry.dir, changes);
  const problems = await workspace.reload(projectId);
  if (problems.length) {
    await write(entry.dir, before);
    await workspace.reload(projectId);
    throw new AuthoringError(
      `That change would break the project, so it was not made:\n  ${problems.join('\n  ')}`,
    );
  }
  return workspace.project(projectId);
}

/**
 * Runs the changes made through one workspace one after another. A change reads a
 * file, checks it and writes it back; two at once could both pass the check and the
 * second would overwrite the first.
 */
const queues = new WeakMap<Workspace, Promise<unknown>>();
export function oneAtATime<A extends unknown[], R>(
  change: (workspace: Workspace, ...args: A) => Promise<R>,
): (workspace: Workspace, ...args: A) => Promise<R> {
  return (workspace, ...args) => {
    const run = (queues.get(workspace) ?? Promise.resolve()).then(() => change(workspace, ...args));
    queues.set(
      workspace,
      run.catch(() => undefined),
    );
    return run;
  };
}

async function write(dir: string, changes: FileChange[]): Promise<void> {
  for (const { file, content } of changes) {
    const full = inside(dir, file);
    if (content === null) {
      await rm(full, { force: true });
    } else {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }
  }
}

/** Resolves a project-relative path, refusing anything outside the project folder. */
export function inside(dir: string, file: string): string {
  const full = path.resolve(dir, file);
  if (!full.startsWith(dir + path.sep)) {
    throw new AuthoringError(`"${file}" is outside the project folder.`);
  }
  return full;
}

export async function readDocument(dir: string, file: string): Promise<Document> {
  return parseYaml(await readFile(inside(dir, file), 'utf8'));
}

function check<T>(
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
  },
  value: unknown,
  what: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const problems = flattenIssues(result.error.issues as never).map(
    (i) => `${formatPath(i.path) || what}: ${i.message}`,
  );
  throw new AuthoringError(`Invalid ${what}:\n  ${problems.join('\n  ')}`);
}

/** Identifies one version of a file's contents, so an editor can tell whether it changed. */
function contentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Where to put a type, and the version of its file the change was made against. */
export interface UpsertOptions {
  /** Library file for a new type. Default: next to types of the same primitive. */
  file?: string;
  /**
   * `contentHash` of the type's file when the editor read it. When the file has
   * changed since, the change is refused rather than overwriting the newer version.
   */
  baseHash?: string;
}

async function writeType(
  workspace: Workspace,
  projectId: string,
  definition: unknown,
  options: UpsertOptions = {},
): Promise<{ file: string; created: boolean; project: ResolvedProject; library: Library }> {
  const type = check(ComponentType, definition, 'component type');
  const project = workspace.project(projectId);
  const existing = project.types[type.id];
  const target = typeFile(project, type, options.file);

  const full = inside(project.dir, target);
  const original = existsSync(full) ? await readFile(full) : null;
  if (options.baseHash !== undefined && original && contentHash(original) !== options.baseHash) {
    throw new ConflictError(
      `${target} changed since you started editing "${type.id}". Reload it to see the newer version, or keep yours to replace it.`,
    );
  }
  const doc = original
    ? parseYaml(original.toString('utf8'))
    : parseYaml('kind: library\ntypes: []\n');
  const types = doc.get('types');
  if (!isSeq(types)) throw new AuthoringError(`${target} has no "types" list.`);
  if (existing) {
    const node = types.get(existing.source.index, true);
    const patched = patchNode(doc, node, type);
    if (patched !== node) types.set(existing.source.index, patched);
  } else {
    types.add(createNode(doc, type));
  }

  const updated = await commit(workspace, projectId, [{ file: target, content: yamlText(doc) }]);
  if (!updated.types[type.id]) {
    // The manifest's `libraries` patterns do not load this file.
    await commit(workspace, projectId, [{ file: target, content: original }]);
    throw new AuthoringError(
      `${target} is not loaded by the manifest's "libraries" patterns; put the type in one of the library files.`,
    );
  }
  return {
    file: target,
    created: !existing,
    project: updated,
    library: await libraryFiles(workspace, projectId),
  };
}

/**
 * Adds a component type, or changes the type with the same id. A changed type is
 * edited in place, key by key, so comments inside it survive. A new type goes into
 * `options.file` if given, else next to other types of the same primitive.
 */
export const upsertType = oneAtATime(writeType);

/** The library file a type lives in, or the one a new type goes into. */
function typeFile(project: ResolvedProject, type: ComponentType, file?: string): string {
  const existing = project.types[type.id];
  if (file && existing && file !== existing.source.file) {
    throw new AuthoringError(
      `"${type.id}" is defined in ${existing.source.file}; change it there, or remove it first.`,
    );
  }
  const target =
    existing?.source.file ??
    file ??
    Object.values(project.types).find((t) => t.base === type.base)?.source.file ??
    Object.values(project.types)[0]?.source.file;
  if (!target) throw new AuthoringError('Give a library file to put the new type in.');
  return target;
}

/** Each library file that defines types, with its `contentHash`, and the file of each type. */
export interface Library {
  files: Record<string, string>;
  types: Record<string, string>;
}

export async function libraryFiles(workspace: Workspace, projectId: string): Promise<Library> {
  const project = workspace.project(projectId);
  const types = Object.fromEntries(
    Object.values(project.types).map((t) => [t.id, t.source.file] as const),
  );
  const files: Record<string, string> = {};
  for (const file of new Set(Object.values(types))) {
    files[file] = contentHash(await readFile(inside(project.dir, file)));
  }
  return { files, types };
}

async function deleteType(
  workspace: Workspace,
  projectId: string,
  id: string,
): Promise<{ file: string }> {
  const project = workspace.project(projectId);
  const type = project.types[id];
  if (!type) throw new AuthoringError(`There is no type "${id}".`);
  const used = project.components.filter((c) => c.type === id).length;
  if (used) {
    throw new AuthoringError(
      `The inventory still has ${used} "${id}" components; take them out of the inventory first.`,
    );
  }
  const doc = await readDocument(project.dir, type.source.file);
  const types = doc.get('types') as YAMLSeq;
  types.delete(type.source.index);
  await commit(workspace, projectId, [{ file: type.source.file, content: yamlText(doc) }]);
  return { file: type.source.file };
}

/** Removes a component type. Refused while the inventory still uses it. */
export const removeType = oneAtATime(deleteType);

async function writeInventory(
  workspace: Workspace,
  projectId: string,
  type: string,
  entries: unknown[],
): Promise<{ count: number; file: string }> {
  const project = workspace.project(projectId);
  if (!project.types[type]) throw new AuthoringError(`There is no type "${type}".`);
  const checked = entries.map((e, i) =>
    check(InventoryEntry, { ...(e as object), type }, `inventory entry ${i + 1}`),
  );
  const file = project.manifest.inventory;
  const doc = await readDocument(project.dir, file);
  const components = doc.get('components');
  if (!isSeq(components)) throw new AuthoringError(`${file} has no "components" list.`);
  const items = components.items;
  const first = items.findIndex((n: unknown) => isMap(n) && n.get('type') === type);
  const kept = items.filter((n: unknown) => !(isMap(n) && n.get('type') === type));
  const at =
    first === -1
      ? kept.length
      : items.slice(0, first).filter((n: unknown) => kept.includes(n)).length;
  components.items = [
    ...kept.slice(0, at),
    ...checked.map((entry) => doc.createNode(entry, { flow: false })),
    ...kept.slice(at),
  ];
  const updated = await commit(workspace, projectId, [{ file, content: yamlText(doc) }]);
  return { count: updated.components.filter((c) => c.type === type).length, file };
}

/**
 * Replaces every inventory entry for one type with the given entries (each like
 * an inventory entry, without `type`). An empty list takes the type out of the box.
 */
export const setInventory = oneAtATime(writeInventory);

/** Writes an image or CSV file into the project, as text (SVG, CSV) or base64. */
export async function addAsset(
  workspace: Workspace,
  projectId: string,
  file: string,
  content: { text?: string; base64?: string },
): Promise<{ file: string; bytes: number }> {
  if (!ASSET_FILE.test(file)) {
    throw new AuthoringError('Assets must be .svg, .png, .jpg, .gif, .webp or .csv files.');
  }
  if ((content.text === undefined) === (content.base64 === undefined)) {
    throw new AuthoringError('Give exactly one of "text" or "base64".');
  }
  const project = workspace.project(projectId);
  const data =
    content.text !== undefined ? Buffer.from(content.text) : Buffer.from(content.base64!, 'base64');
  inside(project.dir, file);
  await commit(workspace, projectId, [{ file, content: data }]);
  return { file, bytes: data.length };
}
