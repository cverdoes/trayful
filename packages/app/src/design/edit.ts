// Pure edits to a component type in the designer. Each returns a new type and
// leaves the one it was given alone, so the store can tell what changed.
import {
  PRIMITIVE_INFO,
  type ComponentType,
  type Field,
  type FieldType,
  type Layer,
  type Scalar,
} from '@trayful/formats/browser';

export type Path = (string | number)[];
export type Side = 'front' | 'back';
export type LayerKind = 'text' | 'shape' | 'image';

type Tree = Record<string, unknown> | unknown[];

const isTree = (value: unknown): value is Tree => typeof value === 'object' && value !== null;

/** The value at `path` inside `root`, or undefined when any step is missing. */
export function getIn(root: unknown, path: Path): unknown {
  let value = root;
  for (const key of path) {
    if (!isTree(value)) return undefined;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}

/**
 * A copy of `root` with the value at `path` replaced. Setting `undefined` removes
 * the key, and an object left empty by that is removed too, so clearing a font's
 * size does not leave `font: {}` behind in the file.
 */
export function setIn<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path as [string | number, ...Path];
  const tree = treeFor(root, key);
  const child = setIn((tree as Record<string | number, unknown>)[key], rest, value);
  const removed = child === undefined || isEmptyObject(child);
  if (Array.isArray(tree)) {
    const copy = [...tree];
    if (removed) copy.splice(key as number, 1);
    else copy[key as number] = child;
    return copy as T;
  }
  const entries = Object.entries(tree).filter(([k]) => !removed || k !== key);
  return Object.fromEntries(
    removed || key in tree
      ? entries.map(([k, v]) => [k, k === key ? child : v])
      : [...entries, [key, child]],
  ) as T;
}

/** The object or list to set `key` in: `root` itself, or a new one when there is none. */
function treeFor(root: unknown, key: string | number): Tree {
  if (isTree(root)) return root;
  return typeof key === 'number' ? [] : {};
}

function isEmptyObject(value: unknown): boolean {
  return isTree(value) && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** A copy of a record with one key renamed, keeping the order of its keys. */
export function renameKey<V>(record: Record<string, V>, from: string, to: string) {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k === from ? to : k, v]));
}

/** Whether a type has a back to design. */
export const twoSided = (type: ComponentType) => PRIMITIVE_INFO[type.base].sides === 2;

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export function layersOf(type: ComponentType, side: Side): Layer[] {
  return type[side]?.layers ?? [];
}

function withLayers(type: ComponentType, side: Side, layers: Layer[]): ComponentType {
  return setIn(type, [side, 'layers'], layers.length ? layers : undefined);
}

/** A new layer of a kind, placed near the face's top-left corner. */
export function newLayer(kind: LayerKind, type: ComponentType): Layer {
  if (kind === 'text') return { text: 'Text', at: [5, 5], font: { size: 12 } };
  if (kind === 'shape') return { shape: 'rect', at: [5, 5], size: [20, 10], fill: '#cccccc' };
  const imageField = Object.entries(type.fields ?? {}).find(
    ([, f]) => fieldSpec(f).type === 'image',
  );
  return { image: imageField ? `{{${imageField[0]}}}` : '', at: [5, 5], size: [20, 20] };
}

export function addLayer(type: ComponentType, side: Side, layer: Layer): ComponentType {
  return withLayers(type, side, [...layersOf(type, side), layer]);
}

export function removeLayer(type: ComponentType, side: Side, index: number): ComponentType {
  return withLayers(
    type,
    side,
    layersOf(type, side).filter((_, i) => i !== index),
  );
}

/** Moves a layer up (+1, drawn later, so on top) or down (-1) the face's list. */
export function moveLayer(
  type: ComponentType,
  side: Side,
  index: number,
  by: 1 | -1,
): ComponentType {
  const layers = [...layersOf(type, side)];
  const to = index + by;
  if (to < 0 || to >= layers.length) return type;
  [layers[index], layers[to]] = [layers[to]!, layers[index]!];
  return withLayers(type, side, layers);
}

/** What kind a layer is, from the key that decides it. */
export function layerKind(layer: Layer): LayerKind {
  if ('text' in layer) return 'text';
  return 'image' in layer ? 'image' : 'shape';
}

/** A short label for a layer in the layer list: its kind and what it shows. */
export function layerLabel(layer: Layer): string {
  if ('text' in layer) return `Text ${layer.text}`;
  if ('image' in layer) return `Image ${layer.image || '(no file)'}`;
  return `Shape ${layer.shape}`;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** A field as the designer edits it, whichever way the file writes it. */
export interface FieldSpec {
  type: FieldType | 'enum';
  /** Allowed values, for `enum` fields. */
  values: (string | number)[];
  optional: boolean;
  default?: Scalar;
  description?: string;
}

export function fieldSpec(field: Field): FieldSpec {
  if (typeof field === 'string') {
    const optional = field.endsWith('?');
    return { type: (optional ? field.slice(0, -1) : field) as FieldType, values: [], optional };
  }
  return {
    type: field.enum ? 'enum' : (field.type ?? 'string'),
    values: field.enum ?? [],
    optional: field.optional ?? false,
    default: field.default,
    description: field.description,
  };
}

/** Writes a field back the short way (`int?`) when nothing needs the long one. */
export function fieldFromSpec(spec: FieldSpec): Field {
  const long = spec.type === 'enum' || spec.default !== undefined || Boolean(spec.description);
  const field: Field = long ? longField(spec) : shortField(spec);
  return field;
}

function shortField(spec: FieldSpec): string {
  return `${spec.type}${spec.optional ? '?' : ''}`;
}

function longField(spec: FieldSpec): Exclude<Field, string> {
  const field: Exclude<Field, string> = {};
  if (spec.type === 'enum') field.enum = spec.values.length ? spec.values : ['a'];
  else if (spec.type !== 'string') field.type = spec.type;
  if (spec.default !== undefined) field.default = spec.default;
  if (spec.optional) field.optional = true;
  if (spec.description) field.description = spec.description;
  return field;
}

/** Allowed values typed as a comma-separated list: numbers stay numbers. */
export function parseValues(text: string): (string | number)[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v));
}

const asNumber = (text: string) => (Number.isFinite(Number(text)) ? Number(text) : text);

/** How a default typed into a text box is read, by the field's kind; others stay text. */
const DEFAULT_READERS: Partial<Record<FieldSpec['type'], (text: string) => Scalar>> = {
  int: asNumber,
  number: asNumber,
  bool: (text) => ({ true: true, false: false })[text] ?? text,
  enum: (text) => parseValues(text)[0] ?? text,
};

/** A default value typed into a text box, as the field's kind stores it. */
export function parseDefault(text: string | undefined, spec: FieldSpec): Scalar | undefined {
  const read = DEFAULT_READERS[spec.type] ?? String;
  return text === undefined ? undefined : read(text);
}

/** A field name that the type does not use yet: `field`, `field2`… */
export function freeFieldName(type: ComponentType): string {
  const taken = new Set(Object.keys(type.fields ?? {}));
  const numbered = (n: number) => (n === 1 ? 'field' : `field${n}`);
  let n = 1;
  while (taken.has(numbered(n))) n++;
  return numbered(n);
}
