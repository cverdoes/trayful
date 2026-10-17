// What a component does on the table, read from its properties. The engine, the
// app and the loader all ask these questions the same way.
import { normalizeField, type NormalizedField } from './fields.js';
import {
  REPRESENTATION_INFO,
  type AssetsFile,
  type Back,
  type ComponentType,
  type Control,
  type DropMode,
  type ImageRef,
  type SnapTarget,
} from './schemas.js';

/** An image asset with its tiling filled in. */
export interface Asset {
  file: string;
  rows: number;
  cols: number;
}

/** The images and colours a project's faces can refer to by name. */
export interface Assets {
  images: Record<string, Asset>;
  colors: Record<string, string>;
}

export const NO_ASSETS: Assets = { images: {}, colors: {} };

/** The assets file's images with their default tiling, and its colours. */
export function assetsOf(file: AssetsFile | undefined): Assets {
  const images: Record<string, Asset> = {};
  for (const [name, image] of Object.entries(file?.images ?? {})) {
    images[name] =
      typeof image === 'string'
        ? { file: image, rows: 1, cols: 1 }
        : { file: image.file, rows: image.rows ?? 1, cols: image.cols ?? 1 };
  }
  return { images, colors: { ...file?.colors } };
}

/** How many sides a component has: two when it can be flipped. */
export function sidesOf(type: ComponentType): 1 | 2 {
  return type.flippable ? 2 : 1;
}

/** The back of a flippable component, when it says how the back looks. */
export function backOf(type: ComponentType): Back | undefined {
  return typeof type.flippable === 'object' ? type.flippable.back : undefined;
}

export function isStackable(type: ComponentType): boolean {
  return type.stackable !== undefined;
}

/** Other components a stackable one may share a stack with. */
function stackPartners(type: ComponentType): readonly string[] {
  return typeof type.stackable === 'object' ? (type.stackable.with ?? []) : [];
}

/**
 * Whether two components may lie in one stack: both stackable, and the same
 * component or one lists the other in its `stackable.with`.
 */
export function stacksWith(a: ComponentType, b: ComponentType): boolean {
  if (!isStackable(a) || !isStackable(b)) return false;
  return a.id === b.id || stackPartners(a).includes(b.id) || stackPartners(b).includes(a.id);
}

/** Degrees per turn, or undefined when the component does not turn. */
export function rotationStep(type: ComponentType): number | undefined {
  if (!type.rotates) return undefined;
  return (typeof type.rotates === 'object' ? type.rotates.step : undefined) ?? 90;
}

/** Where other components snap onto this one; empty when it is not a container. */
export function dropAreas(type: ComponentType): readonly SnapTarget[] {
  return type.container ?? [];
}

/** What a drop area does with what lands in it, its default filled in. */
export function dropMode(target: Pick<SnapTarget, 'area' | 'mode'>): DropMode {
  return target.mode ?? (target.area ? 'free' : 'single');
}

/** Whether a spot in this mode takes more things when something already lies on it. */
export function holdsMany(mode: DropMode): boolean {
  return mode === 'pile' || mode === 'group';
}

/** Whether a drop area takes a component, by its id or its representation. */
export function areaAccepts(area: Pick<SnapTarget, 'accepts'>, type: ComponentType): boolean {
  return !area.accepts || area.accepts.includes(type.id) || area.accepts.includes(type.is);
}

const DEFAULT_RANGE: Record<'die' | 'counter', [number, number]> = {
  die: [1, 6],
  counter: [0, 99],
};
const DEFAULT_CONTROLS: Record<'die' | 'counter', Control[]> = { die: ['roll'], counter: ['step'] };

/** The values of a die or counter, with defaults filled in. */
export interface ValueSpec {
  /** `[min, max]` whole numbers, unless the values are a `list`. */
  range?: [number, number];
  list?: (string | number)[];
  controls: Control[];
}

/** A die's or counter's values, or undefined for components without a value. */
export function valuesOf(type: ComponentType): ValueSpec | undefined {
  if (type.is !== 'die' && type.is !== 'counter') return undefined;
  const controls = type.values?.controls ?? DEFAULT_CONTROLS[type.is];
  if (type.values?.list) return { list: type.values.list, controls };
  return { range: type.values?.range ?? DEFAULT_RANGE[type.is], controls };
}

/** How many values a die or counter has. */
export function valueCount(spec: ValueSpec): number {
  return spec.list ? spec.list.length : spec.range![1] - spec.range![0] + 1;
}

/** The value at a position, counting from 0: the first value is the lowest or the first listed. */
export function valueAt(spec: ValueSpec, index: number): string | number {
  return spec.list ? spec.list[index]! : spec.range![0] + index;
}

/** A value's position among the values, or -1 when it is not one of them. */
export function valueIndex(spec: ValueSpec, value: unknown): number {
  if (spec.list) return spec.list.indexOf(value as string | number);
  if (typeof value !== 'number' || !Number.isInteger(value)) return -1;
  const [min, max] = spec.range!;
  return value >= min && value <= max ? value - min : -1;
}

/**
 * The value `by` steps away from `value`, staying within the values: a counter's
 * up and down buttons. A value that is not one of them counts as the first.
 */
export function stepValue(spec: ValueSpec, value: unknown, by: number): string | number {
  const index = Math.max(valueIndex(spec, value), 0) + by;
  return valueAt(spec, Math.min(Math.max(index, 0), valueCount(spec) - 1));
}

/** Whether a representation carries a value. */
export function isValued(type: ComponentType): boolean {
  return REPRESENTATION_INFO[type.is].valued;
}

/** The image references on a component's faces, with their paths inside it. */
export function imageRefs(type: ComponentType): { ref: ImageRef; path: (string | number)[] }[] {
  const refs: { ref: ImageRef; path: (string | number)[] }[] = [];
  if (type.face?.image) refs.push({ ref: type.face.image, path: ['face', 'image'] });
  const back = backOf(type);
  if (back?.image) refs.push({ ref: back.image, path: ['flippable', 'back', 'image'] });
  return refs;
}

/** Whether each component of this kind picks its own tile, with a `tile` value. */
export function picksTile(type: ComponentType): boolean {
  return imageRefs(type).some(({ ref }) => typeof ref === 'object' && ref.tile === 'instance');
}

/** Fields a component uses without declaring them: label fields, and `tile` when it picks one. */
function implicitFields(type: ComponentType): Record<string, NormalizedField> {
  const implicit: Record<string, NormalizedField> = {};
  for (const label of [...(type.face?.labels ?? []), ...(backOf(type)?.labels ?? [])]) {
    if (label.field) implicit[label.field] = { type: 'string', optional: true };
  }
  if (picksTile(type)) implicit.tile = { type: 'int', optional: false, default: 0 };
  return implicit;
}

/** Every field of a component: those it declares, and those its faces imply. */
export function componentFields(type: ComponentType): Record<string, NormalizedField> {
  const declared = Object.fromEntries(
    Object.entries(type.fields ?? {}).map(([name, field]) => [name, normalizeField(field)]),
  );
  return { ...implicitFields(type), ...declared };
}

/** The value a fresh die or counter shows: its lowest, or first, value. */
export function startValue(type: ComponentType): string | number | undefined {
  const spec = valuesOf(type);
  return spec ? valueAt(spec, 0) : undefined;
}
