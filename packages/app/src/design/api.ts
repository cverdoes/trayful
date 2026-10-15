// The server's authoring routes, as the designer calls them.
import type { ComponentType, Scalar } from '@trayful/formats/browser';

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
