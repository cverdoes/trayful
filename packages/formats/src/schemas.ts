import { AssetsFile } from './schemas/assets.js';
import { LibraryFile } from './schemas/library.js';
import { InventoryFile, ManifestFile, SetupFile } from './schemas/project.js';
import { TableFile } from './schemas/table.js';

/**
 * Zod schemas for every Trayful file kind. These are the single source of truth:
 * the loader validates against them, the JSON Schemas in `schema/` are exported
 * from them, and the format reference in `docs/reference/` is generated from them.
 * Descriptions written here end up in the reference docs, so keep them user-facing.
 */

export * from './schemas/common.js';
export * from './schemas/library.js';
export * from './schemas/assets.js';
export * from './schemas/legacy.js';
export * from './schemas/project.js';
export * from './schemas/table.js';

/** Every file kind with its schema, in the order the reference lists them. */
export const FILE_KINDS = {
  manifest: ManifestFile,
  library: LibraryFile,
  assets: AssetsFile,
  inventory: InventoryFile,
  setup: SetupFile,
  table: TableFile,
} as const;
export type FileKind = keyof typeof FILE_KINDS;
