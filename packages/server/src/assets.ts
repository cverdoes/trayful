// The assets file, edited from the designer and by agents: named images, how they
// are cut into tiles, and named colours. Comments elsewhere in the file are kept.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ASSETS_FILE, freeTypeId, type ImageAsset } from '@trayful/formats';
import { isMap, type Document } from 'yaml';
import {
  AuthoringError,
  checkAssetFile,
  commit,
  inside,
  oneAtATime,
  requireCurrentFormat,
  unusedPath,
  type FileChange,
} from './authoring.js';
import type { Workspace } from './workspace.js';
import { createNode, parseYaml, yamlText } from './yaml-patch.js';

/** An image file and the tiles it is cut into: rows and columns, 1 when left out. */
export interface ImageSettings {
  file: string;
  rows?: number;
  cols?: number;
}

/** A name for an image: lowercase letters, digits and dashes, as components refer to it. */
const NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Applies a change to the assets file (the one the manifest names, else
 * `assets.yaml`, made when the project has none), with any other file changes, as
 * one checked edit.
 */
async function editAssets(
  workspace: Workspace,
  projectId: string,
  change: (doc: Document) => void,
  others: FileChange[] = [],
): Promise<void> {
  const project = workspace.project(projectId);
  requireCurrentFormat(project);
  const file = project.manifest.assets ?? ASSETS_FILE;
  const full = inside(project.dir, file);
  const doc = parseYaml(existsSync(full) ? await readFile(full, 'utf8') : 'kind: assets\n');
  change(doc);
  await commit(workspace, projectId, [...others, { file, content: yamlText(doc) }]);
}

/** An image entry written the short way, as just its path, when it is not cut into tiles. */
function imageEntry({ file, rows = 1, cols = 1 }: ImageSettings): ImageAsset {
  const entry: ImageAsset =
    rows === 1 && cols === 1
      ? file
      : { file, ...(rows > 1 ? { rows } : {}), ...(cols > 1 ? { cols } : {}) };
  return entry;
}

function setImageIn(doc: Document, name: string, settings: ImageSettings): void {
  const node = createNode(doc, imageEntry(settings));
  // Entries are short; one per line reads best.
  if (isMap(node)) node.flow = true;
  doc.setIn(['images', name], node);
}

/** Refuses a name components could not refer to. */
export function checkImageName(name: string): void {
  if (!NAME.test(name)) {
    throw new AuthoringError(
      `"${name}" is not a usable name: use lowercase letters, digits and dashes.`,
    );
  }
}

/** Names an image already in the project, or changes how it is cut into tiles. */
export const setImage = oneAtATime(
  async (workspace: Workspace, projectId: string, name: string, settings: ImageSettings) => {
    checkImageName(name);
    inside(workspace.project(projectId).dir, settings.file);
    await editAssets(workspace, projectId, (doc) => setImageIn(doc, name, settings));
  },
);

/**
 * Saves a new image into the project, under an unused path, and names it: `name`
 * if given (taking the name off any image that had it), else after its file, with
 * a number added when an image already has that name.
 */
export const addImage = oneAtATime(
  async (
    workspace: Workspace,
    projectId: string,
    upload: { file: string; base64: string; name?: string; rows?: number; cols?: number },
  ): Promise<{ name: string; file: string }> => {
    const project = workspace.project(projectId);
    requireCurrentFormat(project);
    checkAssetFile(upload.file);
    const stem = path.basename(upload.file, path.extname(upload.file));
    const name = upload.name ?? freeTypeId(stem, Object.keys(project.assets.images));
    checkImageName(name);
    // A picture never replaces artwork already in the project.
    const file = unusedPath(project.dir, upload.file);
    const content = Buffer.from(upload.base64, 'base64');
    await editAssets(
      workspace,
      projectId,
      (doc) => setImageIn(doc, name, { file, rows: upload.rows, cols: upload.cols }),
      [{ file, content }],
    );
    return { name, file };
  },
);

/** Takes a name off an image. The file stays; a component still using the name stops this. */
export const removeImage = oneAtATime(
  async (workspace: Workspace, projectId: string, name: string) => {
    if (!workspace.project(projectId).assets.images[name]) {
      throw new AuthoringError(`No image is called "${name}".`);
    }
    await editAssets(workspace, projectId, (doc) => removeIn(doc, 'images', name));
  },
);

/** Names a colour, or changes the one of that name; undefined removes it. */
export const setColor = oneAtATime(
  async (workspace: Workspace, projectId: string, name: string, color: string | undefined) => {
    checkImageName(name);
    await editAssets(workspace, projectId, (doc) => {
      if (color === undefined) removeIn(doc, 'colors', name);
      else doc.setIn(['colors', name], color);
    });
  },
);

/** Removes an entry, and its section when that is left empty. */
function removeIn(doc: Document, section: 'images' | 'colors', name: string): void {
  doc.deleteIn([section, name]);
  const left = doc.get(section);
  if (isMap(left) && left.items.length === 0) doc.delete(section);
}
