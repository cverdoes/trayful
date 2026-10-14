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
import { isMap, isSeq, parseDocument, type Document, type YAMLSeq } from 'yaml';
import type { Workspace } from './workspace.js';

/**
 * Edits to a project's files on behalf of an agent. Every edit is checked by
 * reloading the project; if the files no longer load, the edit is undone and the
 * problems are reported, so a project never ends up broken by a tool call.
 * Comments and formatting elsewhere in the YAML files are kept.
 */
export class AuthoringError extends Error {}

const ASSET_FILE = /\.(svg|png|jpe?g|gif|webp|csv)$/i;

interface FileChange {
  /** Path relative to the project folder. */
  file: string;
  /** New contents, or null to delete the file. */
  content: string | Buffer | null;
}

/** Applies file changes, reloads the project and rolls back if it no longer loads. */
async function commit(workspace: Workspace, projectId: string, changes: FileChange[]) {
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
function inside(dir: string, file: string): string {
  const full = path.resolve(dir, file);
  if (!full.startsWith(dir + path.sep)) {
    throw new AuthoringError(`"${file}" is outside the project folder.`);
  }
  return full;
}

async function readDocument(dir: string, file: string): Promise<Document> {
  return parseDocument(await readFile(inside(dir, file), 'utf8'));
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

/**
 * Adds a component type, or replaces the type with the same id. A new type goes
 * into `file` if given, else next to other types of the same primitive.
 */
export async function upsertType(
  workspace: Workspace,
  projectId: string,
  definition: unknown,
  file?: string,
): Promise<{ file: string; created: boolean; project: ResolvedProject }> {
  const type = check(ComponentType, definition, 'component type');
  const project = workspace.project(projectId);
  const existing = project.types[type.id];
  const target =
    existing?.source.file ??
    file ??
    Object.values(project.types).find((t) => t.base === type.base)?.source.file ??
    Object.values(project.types)[0]?.source.file;
  if (!target) throw new AuthoringError('Give a library file to put the new type in.');
  if (file && existing && file !== existing.source.file) {
    throw new AuthoringError(
      `"${type.id}" is defined in ${existing.source.file}; change it there, or remove it first.`,
    );
  }

  const full = inside(project.dir, target);
  const original = existsSync(full) ? await readFile(full) : null;
  const doc = original
    ? parseDocument(original.toString('utf8'))
    : parseDocument('kind: library\ntypes: []\n');
  const types = doc.get('types');
  if (!isSeq(types)) throw new AuthoringError(`${target} has no "types" list.`);
  const node = doc.createNode(type);
  if (existing) types.set(existing.source.index, node);
  else types.add(node);

  const updated = await commit(workspace, projectId, [{ file: target, content: doc.toString() }]);
  if (!updated.types[type.id]) {
    // The manifest's `libraries` patterns do not load this file.
    await commit(workspace, projectId, [{ file: target, content: original }]);
    throw new AuthoringError(
      `${target} is not loaded by the manifest's "libraries" patterns; put the type in one of the library files.`,
    );
  }
  return { file: target, created: !existing, project: updated };
}

/** Removes a component type. Refused while the inventory still uses it. */
export async function removeType(
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
      `The inventory still has ${used} "${id}" components; remove them with set_inventory first.`,
    );
  }
  const doc = await readDocument(project.dir, type.source.file);
  const types = doc.get('types') as YAMLSeq;
  types.delete(type.source.index);
  await commit(workspace, projectId, [{ file: type.source.file, content: doc.toString() }]);
  return { file: type.source.file };
}

/**
 * Replaces every inventory entry for one type with the given entries (each like
 * an inventory entry, without `type`). An empty list takes the type out of the box.
 */
export async function setInventory(
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
  const updated = await commit(workspace, projectId, [{ file, content: doc.toString() }]);
  return { count: updated.components.filter((c) => c.type === type).length, file };
}

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
