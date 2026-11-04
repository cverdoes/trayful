/**
 * The architecture overview's data model: everything the generator learns from the
 * source, before any HTML is written. `pnpm docs:overview` also saves it as
 * `model.json` next to the site.
 */

/** A field of an interface, or of one variant of a union. */
export interface Member {
  name: string;
  type: string;
  optional: boolean;
  doc?: string;
}

/** One case of a tagged union such as `Command`, named by its `type`. */
export interface Variant {
  tag: string;
  doc?: string;
  members: Member[];
  line: number;
}

export type DeclKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum';

/** A top-level declaration in a source file. */
export interface Decl {
  name: string;
  kind: DeclKind;
  exported: boolean;
  /** The whole doc comment, and its first sentence. */
  doc?: string;
  summary?: string;
  line: number;
  /** The declaration's head, such as `interface TableView extends TableState`, or a short type. */
  signature: string;
  /** For interfaces, object types and the public side of classes. */
  members?: Member[];
  /** For unions of object types tagged by `type`. */
  variants?: Variant[];
}

export interface ModuleInfo {
  /** Package and path inside its `src`, such as `core/engine.ts`. */
  id: string;
  pkg: string;
  /** Path from the repository root. */
  path: string;
  /** What the file is for: its opening comment, or the doc of its first declaration. */
  purpose?: string;
  lines: number;
  decls: Decl[];
  /** Module ids this file imports, inside the repository. */
  imports: string[];
  importedBy: string[];
  /** npm packages and Node built-ins it imports. */
  external: string[];
}

export interface PackageInfo {
  name: string;
  /** The name it is published or imported under, such as `@trayful/core`. */
  npmName: string;
  summary: string;
  /** Layer rank: lower layers may not import higher ones. */
  layer: number;
  /** Where it sits across the layer picture, from 0 to 1. */
  column: number;
  modules: string[];
  /** Other packages it imports, with how many imports. */
  uses: Record<string, number>;
}

export interface McpTool {
  name: string;
  title?: string;
  description: string;
  group: string;
  inputs: Member[];
}

export interface Route {
  method: string;
  path: string;
  module: string;
  line: number;
  doc?: string;
}

export interface CliCommand {
  name: string;
  usage: string;
  text: string;
}

/** A page from `docs/reference/`, shown in the site. */
export interface ReferencePage {
  slug: string;
  title: string;
  markdown: string;
}

export interface Concept {
  slug: string;
  title: string;
  /** Interaction walkthroughs come first in the navigation. */
  kind: 'interaction' | 'concept';
  order: number;
  summary: string;
  markdown: string;
  /** Repository path of the page, for its last-changed date. */
  path: string;
}

export interface Model {
  generatedAt: string;
  commit: string;
  packages: PackageInfo[];
  modules: ModuleInfo[];
  keyTypes: string[];
  tools: McpTool[];
  routes: Route[];
  cli: CliCommand[];
  reference: ReferencePage[];
  concepts: Concept[];
  /** Last commit date of each repository file the concept pages explain. */
  changed: Record<string, string>;
}
