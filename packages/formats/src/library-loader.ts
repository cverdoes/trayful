// Loading a project's libraries and assets, in the current format or the first one.
import { z } from 'zod';
import { assetsOf, componentFields, imageRefs, NO_ASSETS, type Assets } from './component.js';
import { isTemplate } from './fields.js';
import type { ProjectFiles } from './project-files.js';
import type { ResolvedType } from './resolved.js';
import {
  AssetsFile,
  ComponentType as ComponentSchema,
  LegacyComponentType,
  LegacyLibraryFile,
  LibraryFile,
  REPRESENTATIONS,
  type ComponentType,
  type ImageRef,
} from './schemas.js';
import { typeProblems } from './type-checks.js';
import { AssetCollector, typesByBase, upgradeType } from './upgrade.js';

/** An old type that passed its checks, and where it came from. */
interface LegacyEntry {
  type: LegacyComponentType;
  file: string;
  index: number;
}

/** What the libraries define: components by id, and the ids of those that failed their checks. */
export class LibraryLoader {
  readonly types: Record<string, ResolvedType> = {};
  /** Components that exist but failed validation; references to them are not reported again. */
  readonly brokenTypes = new Set<string>();
  assets: Assets = NO_ASSETS;
  /** Ids of old types that were boards, which setups lock in place. */
  readonly boards = new Set<string>();

  constructor(private readonly files: ProjectFiles) {}

  /** Loads library files in the current format, then the assets file, if any. */
  async load(libraryFiles: string[], assetsFile: string | undefined): Promise<void> {
    for (const file of libraryFiles) await this.loadLibrary(file);
    if (assetsFile !== undefined) await this.loadAssets(assetsFile);
    await this.checkReferences();
  }

  private async loadLibrary(file: string): Promise<void> {
    const source = await this.files.read(file);
    if (!source) return;
    // The envelope first, then each component on its own, so one broken component
    // does not hide the others.
    const { data, diagnostics } = source.validate(
      LibraryFile.extend({ components: z.array(z.unknown()) }),
    );
    this.files.diagnostics.push(...diagnostics);
    for (const [index, raw] of (data?.components ?? []).entries()) {
      const result = source.validateValue(ComponentSchema, raw, ['components', index]);
      this.files.diagnostics.push(...result.diagnostics);
      if (result.data) this.add(result.data, file, index, 'components');
      else this.markBroken(raw);
    }
  }

  private async loadAssets(file: string): Promise<void> {
    const source = await this.files.read(file);
    if (!source) return;
    const { data, diagnostics } = source.validate(AssetsFile);
    this.files.diagnostics.push(...diagnostics);
    if (!data) return;
    this.assets = assetsOf(data);
    for (const [name, asset] of Object.entries(this.assets.images)) {
      if (!(await this.files.exists(asset.file))) {
        this.files.report(
          file,
          ['images', name],
          [{ path: [], message: `Image "${asset.file}" not found in the project folder.` }],
        );
      }
    }
  }

  /**
   * Loads library files in the first format and converts their types: image files
   * and palette colours become assets, and each type becomes a component.
   */
  async loadLegacy(libraryFiles: string[]): Promise<void> {
    const collector = new AssetCollector();
    const entries: LegacyEntry[] = [];
    for (const file of libraryFiles) {
      const source = await this.files.read(file);
      if (!source) continue;
      const { data, diagnostics } = source.validate(
        LegacyLibraryFile.extend({ types: z.array(z.unknown()) }),
      );
      this.files.diagnostics.push(...diagnostics);
      collector.palette(data?.palette);
      for (const [index, raw] of (data?.types ?? []).entries()) {
        const result = source.validateValue(LegacyComponentType, raw, ['types', index]);
        this.files.diagnostics.push(...result.diagnostics);
        if (result.data) entries.push({ type: result.data, file, index });
        else this.markBroken(raw);
      }
    }
    await this.checkLegacyImages(entries);
    const bases = typesByBase(entries.map((e) => e.type));
    for (const { type, file, index } of entries) {
      if (type.base === 'board') this.boards.add(type.id);
      this.add(upgradeType(type, collector, bases), file, index, 'types');
    }
    this.assets = assetsOf(collector.file());
    await this.checkReferences();
  }

  /** Image paths written directly in an old library (not via a field) must exist. */
  private async checkLegacyImages(entries: LegacyEntry[]): Promise<void> {
    for (const { type, file, index } of entries) {
      for (const side of ['front', 'back'] as const) {
        for (const [i, layer] of (type[side]?.layers ?? []).entries()) {
          if (!('image' in layer) || isTemplate(layer.image) || !layer.image) continue;
          if (!(await this.files.exists(layer.image))) {
            this.files.report(
              file,
              ['types', index, side, 'layers', i, 'image'],
              [{ path: [], message: `Image "${layer.image}" not found in the project folder.` }],
            );
          }
        }
      }
    }
  }

  private markBroken(raw: unknown): void {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id === 'string') this.brokenTypes.add(id);
  }

  private add(type: ComponentType, file: string, index: number, list: string): void {
    const existing = this.types[type.id];
    if (existing) {
      this.files.report(
        file,
        [list, index, 'id'],
        [{ path: [], message: `"${type.id}" is already defined in ${existing.source.file}.` }],
      );
      return;
    }
    this.types[type.id] = {
      ...type,
      source: { file, index, list },
      normalizedFields: componentFields(type),
    };
    this.files.report(file, [list, index], typeProblems(type));
  }

  /** Checks what components refer to, once all libraries and assets are loaded. */
  private async checkReferences(): Promise<void> {
    for (const type of Object.values(this.types)) {
      const { file, index, list } = type.source;
      this.files.report(
        file,
        [list, index],
        [
          ...this.acceptsProblems(type),
          ...this.stackProblems(type),
          ...this.imageProblems(type),
          ...(await this.layerImageProblems(type)),
        ],
      );
    }
  }

  private known(id: string): boolean {
    return this.types[id] !== undefined || this.brokenTypes.has(id);
  }

  /** `accepts` lists must name components or representations. */
  private acceptsProblems(type: ComponentType) {
    return (type.container ?? []).flatMap((target, i) =>
      (target.accepts ?? []).flatMap((name, j) =>
        this.known(name) || (REPRESENTATIONS as readonly string[]).includes(name)
          ? []
          : [
              {
                path: ['container', i, 'accepts', j],
                message: `"${name}" is neither a component nor a representation (${REPRESENTATIONS.join(', ')}).`,
              },
            ],
      ),
    );
  }

  private stackProblems(type: ComponentType) {
    const partners = typeof type.stackable === 'object' ? (type.stackable.with ?? []) : [];
    return partners.flatMap((id, i) => {
      const other = this.types[id];
      if (!other) {
        return this.brokenTypes.has(id)
          ? []
          : [{ path: ['stackable', 'with', i], message: `There is no component "${id}".` }];
      }
      return other.stackable
        ? []
        : [{ path: ['stackable', 'with', i], message: `"${id}" is not stackable.` }];
    });
  }

  /** Face images must name image assets, and their tiles must exist. */
  private imageProblems(type: ComponentType) {
    return imageRefs(type).flatMap(({ ref, path }) => {
      const message = this.imageProblem(ref);
      return message ? [{ path, message }] : [];
    });
  }

  private imageProblem(ref: ImageRef): string | undefined {
    const name = typeof ref === 'string' ? ref : ref.asset;
    const asset = this.assets.images[name];
    if (!asset) return `There is no image "${name}" in the assets file.`;
    if (typeof ref === 'string') return undefined;
    const tiles = asset.rows * asset.cols;
    if (typeof ref.tile === 'number' && ref.tile >= tiles)
      return `"${name}" has tiles 0 to ${tiles - 1}.`;
    if (ref.row !== undefined && ref.row >= asset.rows) return `"${name}" has ${asset.rows} rows.`;
    if (ref.col !== undefined && ref.col >= asset.cols)
      return `"${name}" has ${asset.cols} columns.`;
    return undefined;
  }

  /** An image written directly in a layer is an asset name or a file in the project. */
  private async layerImageProblems(type: ComponentType) {
    const problems: { path: (string | number)[]; message: string }[] = [];
    const sides = [
      { side: type.face, path: ['face'] },
      {
        side: typeof type.flippable === 'object' ? type.flippable.back : undefined,
        path: ['flippable', 'back'],
      },
    ];
    for (const { side, path } of sides) {
      for (const [i, layer] of (side?.layers ?? []).entries()) {
        if (!('image' in layer) || isTemplate(layer.image) || !layer.image) continue;
        if (this.assets.images[layer.image] || (await this.files.exists(layer.image))) continue;
        problems.push({
          path: [...path, 'layers', i, 'image'],
          message: `"${layer.image}" is neither an image asset nor a file in the project folder.`,
        });
      }
    }
    return problems;
  }
}

/** How many tiles a component that picks its own tile can choose from. */
export function tileChoices(type: ComponentType, assets: Assets): number | undefined {
  const counts = imageRefs(type)
    .filter(({ ref }) => typeof ref === 'object' && ref.tile === 'instance')
    .map(({ ref }) => assets.images[(ref as { asset: string }).asset])
    .filter((a) => a !== undefined)
    .map((a) => a.rows * a.cols);
  return counts.length ? Math.min(...counts) : undefined;
}
