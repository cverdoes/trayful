import { AssetsFile } from './assets.js';
import { LibraryFile } from './library.js';
import { InventoryFile, ManifestFile, SetupFile } from './project.js';
import { TableFile } from './table.js';

/**
 * Zod schemas for every Trayful file kind. These are the single source of truth:
 * the loader validates against them, the JSON Schemas in `schema/` are exported
 * from them, and the format reference in `docs/reference/` is generated from them.
 * Descriptions written here end up in the reference docs, so keep them user-facing.
 */

export * from './common.js';
export * from './library.js';
export * from './assets.js';
export * from './legacy.js';
export * from './project.js';
export * from './table.js';

/**
 * Every file kind with its schema, in the order the reference lists them. Typed by
 * hand so the declarations bundled for `trayful/server` can name it.
 */
export const FILE_KINDS: {
  readonly manifest: typeof ManifestFile;
  readonly library: typeof LibraryFile;
  readonly assets: typeof AssetsFile;
  readonly inventory: typeof InventoryFile;
  readonly setup: typeof SetupFile;
  readonly table: typeof TableFile;
} = {
  manifest: ManifestFile,
  library: LibraryFile,
  assets: AssetsFile,
  inventory: InventoryFile,
  setup: SetupFile,
  table: TableFile,
} as const;
export type FileKind = keyof typeof FILE_KINDS;
