// What loading a project produces: its types, its components and its setups.
import type { Diagnostic } from './diagnostics.js';
import type { NormalizedField } from './fields.js';
import type { ComponentType, ManifestFile, Scalar, SetupFile } from './schemas.js';

export interface ResolvedType extends ComponentType {
  /** Where the type is defined, for error messages. */
  source: { file: string; index: number };
  normalizedFields: Record<string, NormalizedField>;
}

/** One physical component, expanded from the inventory. */
export interface ComponentSpec {
  /** Stable id: `type`, `type.row` or `type.row.copy`, e.g. `action-card.harvest.2`. */
  id: string;
  type: string;
  data: Record<string, Scalar>;
  deck?: string;
}

export interface ResolvedSetup extends SetupFile {
  file: string;
}

export interface ResolvedProject {
  dir: string;
  manifest: ManifestFile;
  palette: Record<string, string>;
  types: Record<string, ResolvedType>;
  components: ComponentSpec[];
  /** Deck name to component ids, top of the deck first. */
  decks: Record<string, string[]>;
  /** Setup name (file name without extension, or its `name`) to setup. */
  setups: Record<string, ResolvedSetup>;
}

export interface LoadResult {
  /** Present when the project has no errors. */
  project?: ResolvedProject;
  diagnostics: Diagnostic[];
}
