// The server's authoring routes, as the designer calls them.
import type { ComponentType, Scalar } from '@trayful/formats/browser';
import type { TrayData } from './tray';

/** Which library file each type is in, and the version of each file. */
export interface Library {
  files: Record<string, string>;
  types: Record<string, string>;
}

/** One component in the box, as the server lists them for printing. */
export interface BoxComponent {
  id: string;
  type: string;
  data: Record<string, Scalar>;
}

export type SaveResult =
  { ok: true; library: Library } | { ok: false; conflict: boolean; message: string };

const query = (project: string) => `?project=${encodeURIComponent(project)}`;

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body;
}

export async function fetchLibrary(project: string): Promise<Library> {
  return json<Library>(await fetch(`/api/library${query(project)}`));
}

export async function fetchComponents(project: string): Promise<BoxComponent[]> {
  return json<BoxComponent[]>(await fetch(`/api/components${query(project)}`));
}

/**
 * Saves a type, into `file` if it is new. `baseHash` is the version of its file the
 * edit started from; a file changed since then comes back as a conflict instead of
 * being overwritten.
 */
export async function saveType(
  project: string,
  type: ComponentType,
  { baseHash, file }: { baseHash?: string; file?: string },
): Promise<SaveResult> {
  const response = await fetch(`/api/types/${encodeURIComponent(type.id)}${query(project)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ definition: type, baseHash, file }),
  });
  const body = (await response.json()) as Library & { error?: string };
  if (response.ok) return { ok: true, library: { files: body.files, types: body.types } };
  return {
    ok: false,
    conflict: response.status === 409,
    message: body.error ?? response.statusText,
  };
}

export async function deleteType(project: string, id: string): Promise<Library> {
  return json<Library>(
    await fetch(`/api/types/${encodeURIComponent(id)}${query(project)}`, { method: 'DELETE' }),
  );
}

async function post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  return json<T>(
    await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

const assetUrl = (project: string, kind: 'images' | 'colors', name: string) =>
  `/api/assets/${kind}/${encodeURIComponent(name)}${query(project)}`;

/** An image file and how it is cut into tiles. */
export interface ImageSettings {
  file: string;
  rows?: number;
  cols?: number;
}

/** Saves a new image into the project and names it after its file; answers its name and path. */
export async function addImageAsset(project: string, file: string, base64: string) {
  return post<{ name: string; file: string }>(`/api/assets/images${query(project)}`, {
    file,
    base64,
  });
}

/** Names an image in the project, or changes how it is cut into tiles. */
export async function setImageAsset(project: string, name: string, image: ImageSettings) {
  return post<{ name: string }>(assetUrl(project, 'images', name), image, 'PUT');
}

/** Takes the name off an image; refused while a component uses it. */
export async function removeImageAsset(project: string, name: string) {
  return json<{ name: string }>(
    await fetch(assetUrl(project, 'images', name), { method: 'DELETE' }),
  );
}

/** Names a colour, or changes the one of that name. */
export async function setColorAsset(project: string, name: string, color: string) {
  return post<{ name: string }>(assetUrl(project, 'colors', name), { color }, 'PUT');
}

/** Removes a named colour. */
export async function removeColorAsset(project: string, name: string) {
  return json<{ name: string }>(
    await fetch(assetUrl(project, 'colors', name), { method: 'DELETE' }),
  );
}

/** Gives a type a new id, everywhere the project uses it: library, inventory and setups. */
export async function renameType(project: string, id: string, to: string): Promise<Library> {
  return post<Library>(`/api/types/${encodeURIComponent(id)}/rename${query(project)}`, { to });
}

/** Gives a field a new name in its type, the inventory rows and CSV files of that type. */
export async function renameField(
  project: string,
  id: string,
  field: string,
  to: string,
): Promise<Library> {
  const path = `/api/types/${encodeURIComponent(id)}/fields/${encodeURIComponent(field)}/rename`;
  return post<Library>(`${path}${query(project)}`, { to });
}

/** Rewrites a project made in the first file format in the current one. */
export async function migrateProject(project: string): Promise<{ files: string[] }> {
  return post<{ files: string[] }>(`/api/migrate${query(project)}`, {});
}

const trayUrl = (project: string, id: string, rest = '') =>
  `/api/tray/${encodeURIComponent(id)}${rest}${query(project)}`;

/** One component's inventory entries, and the CSV files they read. */
export async function fetchTray(project: string, id: string): Promise<TrayData> {
  return json<TrayData>(await fetch(trayUrl(project, id)));
}

/** Saves one component's entries and the CSV files they read, all or nothing. */
export async function saveTray(project: string, id: string, tray: TrayData): Promise<TrayData> {
  return post<TrayData>(trayUrl(project, id), tray, 'PUT');
}

/** Copies a CSV file into the project and adds an entry that reads it. */
export async function importCsv(
  project: string,
  id: string,
  csv: { name: string; text: string },
): Promise<TrayData> {
  return post<TrayData>(trayUrl(project, id, '/csv'), csv);
}
