// What loading a project produces: its components, what is in the box, and its setups.
import type { Assets } from './component.js';
import type { Diagnostic } from './diagnostics.js';
import type { NormalizedField } from './fields.js';
import type { ComponentType, ManifestFile, Scalar, SetupFile } from './schemas.js';

export interface ResolvedType extends ComponentType {
  /** Where the component is defined: its file, and its place in the file's list. */
  source: { file: string; index: number; list: string };
  normalizedFields: Record<string, NormalizedField>;
}

/** One physical component, expanded from the inventory. */
export interface ComponentSpec {
  /** Stable id: `component`, `component.row` or `component.row.copy`, e.g. `action-card.harvest.2`. */
  id: string;
  /** Id of the component in the library. */
  type: string;
  data: Record<string, Scalar>;
  deck?: string;
}

export interface ResolvedSetup extends SetupFile {
  file: string;
}

export interface ResolvedProject {
  dir: string;
  /** The manifest, converted to the current format when the project is in the first one. */
  manifest: ManifestFile;
  /** True for a project still in the first format, which the editors do not change. */
  legacy: boolean;
  /** The library files the manifest's patterns match, including any that define nothing. */
  libraries: string[];
  assets: Assets;
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
