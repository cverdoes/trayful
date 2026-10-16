import { readFile } from 'node:fs/promises';
import {
  ASSETS_FILE,
  FieldName,
  Slug,
  type ResolvedProject,
  type ResolvedType,
} from '@trayful/formats';
import { isMap, isScalar, isSeq, visit, type Document, type Scalar } from 'yaml';
import { checkImageName } from './assets.js';
import {
  AuthoringError,
  commit,
  inside,
  oneAtATime,
  readDocument,
  requireCurrentFormat,
  type FileChange,
} from './authoring.js';
import type { Workspace } from './workspace.js';
import { yamlText } from './yaml-patch.js';

/**
 * Renaming a type or a field, and every reference to it across the project's files,
 * as one change. Each reference is edited in its own YAML node, so comments and
 * formatting around it stay as written.
 */

/** Keys an inventory row uses for itself, so no field can be named after them. */
const ROW_KEYS = new Set(['count', 'id']);

/** The files one rename reads, and the new contents of those it changed. */
class FileEdits {
  private readonly changed = new Map<string, string>();

  constructor(private readonly dir: string) {}

  /** Edits a YAML file; `edit` says whether it changed anything. Returns the document. */
  async yaml(file: string, edit: (doc: Document) => boolean): Promise<Document> {
    const doc = await readDocument(this.dir, file);
    if (edit(doc)) this.changed.set(file, yamlText(doc));
    return doc;
  }

  async text(file: string, edit: (text: string) => string): Promise<void> {
    const before = await readFile(inside(this.dir, file), 'utf8');
    const after = edit(before);
    if (after !== before) this.changed.set(file, after);
  }

  get files(): string[] {
    return [...this.changed.keys()];
  }

  get changes(): FileChange[] {
    return [...this.changed].map(([file, content]) => ({ file, content }));
  }
}

async function changeTypeId(
  workspace: Workspace,
  projectId: string,
  from: string,
  to: string,
): Promise<{ id: string; files: string[] }> {
  const project = workspace.project(projectId);
  checkNewTypeId(project, from, to);
  const sameType = (id: string) => (id === from ? to : id);
  /** `text` with its leading type id renamed, when the id is followed by what `rest` matches. */
  const leading = (rest: RegExp) => (text: string) =>
    text.startsWith(from) && rest.test(text.slice(from.length))
      ? to + text.slice(from.length)
      : text;
  // Component ids start with their type: `worker`, `worker.red.1`, `worker~2`.
  const component = leading(/^(?:$|[.~])/);
  // Snap targets are `owner/target` or `owner/target/index`, the owner a type or component id.
  const target = leading(/^(?:[.~][^/]*)?\//);

  const edits = new FileEdits(project.dir);
  for (const file of new Set(Object.values(project.types).map((t) => t.source.file))) {
    await edits.yaml(file, (doc) => retypeLibrary(doc, sameType));
  }
  await edits.yaml(project.manifest.inventory, (doc) =>
    anyChanged(items(doc.get('components', true)), (entry) =>
      rewrite(child(entry, 'component'), sameType),
    ),
  );
  for (const setup of Object.values(project.setups)) {
    await edits.yaml(setup.file, (doc) =>
      anyChanged(items(doc.get('steps', true)), (step) =>
        [
          rewrite(child(step, 'place'), component),
          rewrite(child(step, 'at'), target),
          rewrite(child(child(step, 'deal'), 'to'), target),
        ].includes(true),
      ),
    );
  }
  await commit(workspace, projectId, edits.changes);
  return { id: to, files: edits.files };
}

function checkNewTypeId(project: ResolvedProject, from: string, to: string): void {
  requireCurrentFormat(project);
  if (!project.types[from]) throw new AuthoringError(`There is no component "${from}".`);
  if (project.types[to]) {
    throw new AuthoringError(`There is already a component "${to}"; pick another id.`);
  }
  const valid = Slug.safeParse(to);
  if (!valid.success) {
    throw new AuthoringError(`"${to}" is not a valid id. ${valid.error.issues[0]?.message}`);
  }
}

/** Renames a component's own `id`, and the component in every `accepts` and `stackable.with`. */
function retypeLibrary(doc: Document, rename: (id: string) => string): boolean {
  return anyChanged(items(doc.get('components', true)), (type) =>
    [
      rewrite(child(type, 'id'), rename),
      anyChanged(items(child(type, 'container')), (target) =>
        anyChanged(items(child(target, 'accepts')), (accepted) => rewrite(accepted, rename)),
      ),
      anyChanged(items(child(child(type, 'stackable'), 'with')), (other) => rewrite(other, rename)),
    ].includes(true),
  );
}

/**
 * Gives a component type a new id, and changes every file that refers to it: the
 * library (its definition and the snap targets that accept it), the inventory, and
 * the setups that place its components or put things on its snap targets. Only the
 * files that refer to it are written.
 */
export const renameType = oneAtATime(changeTypeId);

async function changeFieldName(
  workspace: Workspace,
  projectId: string,
  typeId: string,
  field: { from: string; to: string },
): Promise<{ field: string; files: string[] }> {
  const project = workspace.project(projectId);
  requireCurrentFormat(project);
  const type = project.types[typeId];
  if (!type) throw new AuthoringError(`There is no component "${typeId}".`);
  checkNewFieldName(type, field.from, field.to);
  const { from, to } = field;

  const edits = new FileEdits(project.dir);
  await edits.yaml(type.source.file, (doc) =>
    renameInType(items(doc.get('components', true))[type.source.index], from, to),
  );
  const inventory = await edits.yaml(project.manifest.inventory, (doc) =>
    anyChanged(entriesOf(doc, typeId), (entry) =>
      [
        renameKey(child(entry, 'data'), from, to),
        renameKey(child(entry, 'each'), from, to),
        anyChanged(items(child(entry, 'items')), (row) => renameKey(row, from, to)),
      ].includes(true),
    ),
  );
  const csvFiles = new Set(entriesOf(inventory, typeId).map((entry) => stringAt(entry, 'from')));
  for (const file of csvFiles) {
    if (file) await edits.text(file, (csv) => renameCsvColumn(csv, from, to));
  }
  await commit(workspace, projectId, edits.changes);
  return { field: to, files: edits.files };
}

function checkNewFieldName(type: ResolvedType, from: string, to: string): void {
  const fields = type.fields ?? {};
  if (!(from in fields)) throw new AuthoringError(`"${type.id}" has no field "${from}".`);
  if (to in fields) throw new AuthoringError(`"${type.id}" already has a field "${to}".`);
  const valid = FieldName.safeParse(to);
  if (!valid.success) {
    throw new AuthoringError(
      `"${to}" is not a valid field name. ${valid.error.issues[0]?.message}`,
    );
  }
  if (ROW_KEYS.has(to)) {
    throw new AuthoringError(
      `"${to}" is taken: inventory rows use "count" and "id" for themselves. Pick another name.`,
    );
  }
}

/** Renames the field in a component's `fields`, its labels, and its `{{placeholders}}` everywhere in it. */
function renameInType(type: unknown, from: string, to: string): boolean {
  const placeholder = new RegExp(String.raw`\{\{(\s*)${from}(\s*)\}\}`, 'g');
  const sides = [child(type, 'face'), child(child(type, 'flippable'), 'back')];
  const labels = sides.flatMap((side) => items(child(side, 'labels')));
  let changed = renameKey(child(type, 'fields'), from, to);
  for (const label of labels) {
    changed = rewrite(child(label, 'field'), (name) => (name === from ? to : name)) || changed;
  }
  if (!isMap(type)) return changed;
  visit(type, {
    Scalar: (key, node) => {
      if (key === 'key') return;
      changed = rewrite(node, (text) => text.replace(placeholder, `{{$1${to}$2}}`)) || changed;
    },
  });
  return changed;
}

/**
 * Renames a field and every use of it: its key in the type's `fields`, its
 * `{{placeholders}}` in the type's faces, and its values in the type's inventory
 * entries (`data`, each `items` row, `each`, and the header of a `from` CSV file).
 */
export const renameField = oneAtATime(changeFieldName);

async function changeImageName(
  workspace: Workspace,
  projectId: string,
  from: string,
  to: string,
): Promise<{ name: string; files: string[] }> {
  const project = workspace.project(projectId);
  requireCurrentFormat(project);
  if (!project.assets.images[from]) throw new AuthoringError(`No image is called "${from}".`);
  if (project.assets.images[to]) {
    throw new AuthoringError(`An image is already called "${to}"; pick another name.`);
  }
  checkImageName(to);
  const sameImage = (name: string) => (name === from ? to : name);

  const edits = new FileEdits(project.dir);
  await edits.yaml(project.manifest.assets ?? ASSETS_FILE, (doc) =>
    renameKey(doc.get('images', true), from, to),
  );
  for (const file of new Set(Object.values(project.types).map((t) => t.source.file))) {
    await edits.yaml(file, (doc) =>
      anyChanged(items(doc.get('components', true)), (type) => renameImageIn(type, sameImage)),
    );
  }
  await commit(workspace, projectId, edits.changes);
  return { name: to, files: edits.files };
}

/** Renames the image a component's faces show, written as a name or as `asset`, and in its layers. */
function renameImageIn(type: unknown, rename: (name: string) => string): boolean {
  const sides = [child(type, 'face'), child(child(type, 'flippable'), 'back')];
  return anyChanged(sides, (side) =>
    [
      rewrite(child(side, 'image'), rename),
      rewrite(child(child(side, 'image'), 'asset'), rename),
      anyChanged(items(child(side, 'layers')), (layer) => rewrite(child(layer, 'image'), rename)),
    ].includes(true),
  );
}

/**
 * Gives an image a new name, and changes every component that shows it: on a face
 * or back, by name or as a sheet's `asset`, and in an advanced layer that names it.
 * A layer that makes the name from a `{{field}}` is left as it is.
 */
export const renameImage = oneAtATime(changeImageName);

/**
 * Renames one column in the header row of a CSV file. Everything else, including the
 * rows, quoting and line endings, stays byte for byte as it was.
 */
function renameCsvColumn(text: string, from: string, to: string): string {
  const lineEnd = text.search(/\r?\n/);
  const end = lineEnd === -1 ? text.length : lineEnd;
  // A cell is quoted (and may then hold commas) or runs to the next comma.
  const header = text
    .slice(0, end)
    .replace(/"((?:[^"]|"")*)"|[^,]+/g, (cell, quoted?: string) =>
      (quoted ?? cell).trim() === from ? cell.replace(from, to) : cell,
    );
  return header + text.slice(end);
}

// ---------------------------------------------------------------------------
// Reading and changing YAML nodes in place
// ---------------------------------------------------------------------------

function items(node: unknown): unknown[] {
  return isSeq(node) ? node.items : [];
}

function child(node: unknown, key: string): unknown {
  return isMap(node) ? node.get(key, true) : undefined;
}

function stringAt(node: unknown, key: string): string | undefined {
  const value = child(node, key);
  return isScalar(value) && typeof value.value === 'string' ? value.value : undefined;
}

function entriesOf(inventory: Document, typeId: string): unknown[] {
  return items(inventory.get('components', true)).filter(
    (entry) => stringAt(entry, 'component') === typeId,
  );
}

/** Applies `change` to every node, and says whether it changed any of them. */
function anyChanged(nodes: unknown[], change: (node: unknown) => boolean): boolean {
  return nodes.map(change).includes(true);
}

/** Changes a text scalar's value in place, so its quotes and comments stay. */
function rewrite(node: unknown, change: (text: string) => string): boolean {
  if (!isScalar(node) || typeof node.value !== 'string') return false;
  const next = change(node.value);
  if (next === node.value) return false;
  (node as Scalar<string>).value = next;
  return true;
}

/** Renames a key of a map in place, keeping its position, value and comments. */
function renameKey(map: unknown, from: string, to: string): boolean {
  const pair = isMap(map)
    ? map.items.find((p) => isScalar(p.key) && p.key.value === from)
    : undefined;
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = to;
  return true;
}
