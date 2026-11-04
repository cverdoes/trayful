/**
 * What the architecture overview covers that the code cannot say by itself: the
 * packages in layer order, and the types worth a page of their own.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CONCEPTS_DIR = path.join(ROOT, 'architecture');
export const DEFAULT_OUT = path.join(ROOT, '.reports', 'overview');
export const REPO_URL = 'https://github.com/cverdoes/trayful';

/**
 * Packages, lowest layer first; the same layers `.dependency-cruiser.cjs` enforces.
 * `column` places a package across the layer picture, from 0 (left) to 1 (right); the
 * lowest layer spans the whole width.
 */
export const PACKAGES: { name: string; layer: number; column: number }[] = [
  { name: 'formats', layer: 0, column: 0.5 },
  { name: 'core', layer: 1, column: 0.5 },
  { name: 'server', layer: 2, column: 0.22 },
  { name: 'app', layer: 2, column: 0.78 },
  { name: 'cli', layer: 3, column: 0.22 },
];

/** Types with a page of their own: the ones most of the code is about. `package:Name`. */
export const KEY_TYPES = [
  'formats:ResolvedProject',
  'formats:ComponentSpec',
  'core:TableState',
  'core:TableObject',
  'core:Command',
  'core:TableEngine',
  'core:HistoryEntry',
  'core:TableView',
  'core:ClientMessage',
  'core:ServerMessage',
  'core:Activity',
  'server:Workspace',
  'server:TableSession',
];
