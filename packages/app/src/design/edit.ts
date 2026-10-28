// Pure edits to a component type in the designer. Each returns a new type and
// leaves the one it was given alone, so the store can tell what changed.
import {
  REPRESENTATION_INFO,
  sidesOf,
  type ComponentType,
  type Field,
  type FieldType,
  type Label,
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

/** Behaviours written as `true` or as an object of settings. */
const TOGGLES = new Set(['flippable', 'rotates', 'stackable']);

/**
 * `setIn` for a component, keeping a behaviour on when an edit empties its
 * settings: `rotates: {}` is tidied away, but the component still rotates.
 */
export function editType(type: ComponentType, path: Path, value: unknown): ComponentType {
  const next = setIn(type, path, value);
  const key = path[0] as keyof ComponentType;
  if (path.length > 1 && TOGGLES.has(key) && type[key] !== undefined && next[key] === undefined)
    return { ...next, [key]: true };
  return next;
}

/** Behaviours of pieces and zones, which dice and counters do not have. */
const PIECE_BEHAVIOURS = ['flippable', 'rotates', 'stackable', 'container'] as const;

/** What a kind of component cannot have. A stamp is only its face. */
function notFor(is: ComponentType['is']): readonly string[] {
  if (is === 'stamp') return [...PIECE_BEHAVIOURS, 'values', 'fields'];
  return REPRESENTATION_INFO[is].valued ? PIECE_BEHAVIOURS : ['values'];
}

/**
 * The component as another kind of thing, without the behaviours that kind cannot
 * have: a die or counter keeps no flipping or drop areas, a piece or zone no values,
 * and a stamp neither, nor fields.
 */
export function withRepresentation(type: ComponentType, is: ComponentType['is']): ComponentType {
  const dropped = notFor(is);
  const kept = Object.entries(type).filter(([key]) => !dropped.includes(key));
  return { ...Object.fromEntries(kept), is } as ComponentType;
}

/** Whether a type has a back to design. */
export const twoSided = (type: ComponentType) => sidesOf(type) === 2;

/** Where a side lives in a component: its face, or the back of a flippable one. */
export function sidePath(side: Side): Path {
  return side === 'front' ? ['face'] : ['flippable', 'back'];
}

/** A side of a component as written, if it has one. */
export function sideOf(type: ComponentType, side: Side) {
  return getIn(type, sidePath(side)) as NonNullable<ComponentType['face']> | undefined;
}

// ---------------------------------------------------------------------------
// Layers and labels
// ---------------------------------------------------------------------------

/**
 * What the designer lists and moves on a side: its layers, then its labels, in
 * the order they are drawn. A label shows as a text layer, a field label as the
 * placeholder its field fills.
 */
export interface Item {
  layer: Layer;
  /** Where the layer or label is in the component. */
  path: Path;
  label?: Label;
}

export function itemsOf(type: ComponentType, side: Side): Item[] {
  const base = sidePath(side);
  const face = sideOf(type, side);
  return [
    ...(face?.layers ?? []).map((layer, i) => ({ layer, path: [...base, 'layers', i] })),
    ...(face?.labels ?? []).map((label, i) => ({
      layer: labelLayer(label),
      path: [...base, 'labels', i],
      label,
    })),
  ];
}

function labelLayer(label: Label): Layer {
  const { field, text, ...rest } = label;
  return { ...rest, text: field === undefined ? (text ?? '') : `{{${field}}}` };
}

/** The layers drawn on a side, labels included, for hit testing and snapping. */
export function layersOf(type: ComponentType, side: Side): Layer[] {
  return itemsOf(type, side).map((item) => item.layer);
}

/** The component with an item replaced by a moved, resized or turned copy of its layer. */
export function withItem(type: ComponentType, item: Item, layer: Layer): ComponentType {
  if (!item.label) return editType(type, item.path, layer);
  const { text, ...rest } = layer as Extract<Layer, { text: string }>;
  const label =
    item.label.field === undefined ? { ...rest, text } : { ...rest, field: item.label.field };
  return editType(type, item.path, label);
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

/** A new label, showing the first declared field when there is one. */
export function newLabel(type: ComponentType): Label {
  const field = Object.keys(type.fields ?? {})[0];
  return field ? { field, at: [5, 5] } : { text: 'Label', at: [5, 5] };
}

/** Adds a layer or label to a side and returns the component and the new item's index. */
export function addItem(
  type: ComponentType,
  side: Side,
  item: { layer: Layer } | { label: Label },
): { type: ComponentType; index: number } {
  const face = sideOf(type, side);
  const [list, value] = 'layer' in item ? ['layers', item.layer] : ['labels', item.label];
  const items = (face?.[list as 'layers'] ?? []) as unknown[];
  const next = editType(type, [...sidePath(side), list, items.length], value);
  const index = list === 'layers' ? items.length : itemsOf(type, side).length;
  return { type: next, index };
}

/** Removes an item; a list left empty goes too. */
export function removeItem(type: ComponentType, side: Side, index: number): ComponentType {
  const item = itemsOf(type, side)[index];
  if (!item) return type;
  const listPath = item.path.slice(0, -1);
  const list = getIn(type, listPath) as unknown[];
  return list.length === 1
    ? editType(type, listPath, undefined)
    : editType(type, item.path, undefined);
}

/**
 * Moves an item up (+1, drawn later, so on top) or down (-1) its list. Labels are
 * always drawn over layers, so an item stays among its own kind.
 */
export function moveItem(
  type: ComponentType,
  side: Side,
  index: number,
  by: 1 | -1,
): ComponentType {
  const items = itemsOf(type, side);
  const item = items[index];
  const other = items[index + by];
  if (!item || !other || Boolean(item.label) !== Boolean(other.label)) return type;
  const a = getIn(type, item.path);
  const b = getIn(type, other.path);
  return editType(editType(type, item.path, b), other.path, a);
}

/** Whether an item can move one place up (+1) or down (-1) among its own kind. */
export function canMove(type: ComponentType, side: Side, index: number, by: 1 | -1): boolean {
  const items = itemsOf(type, side);
  const other = items[index + by];
  return other !== undefined && Boolean(other.label) === Boolean(items[index]?.label);
}

/** What kind a layer is, from the key that decides it. */
export function layerKind(layer: Layer): LayerKind {
  if ('text' in layer) return 'text';
  return 'image' in layer ? 'image' : 'shape';
}

/** A short label for a layer in the layer list: its kind and what it shows. */
export function itemLabel(item: Item): string {
  if (item.label)
    return `Label ${item.label.field === undefined ? item.label.text : `{{${item.label.field}}}`}`;
  return layerLabel(item.layer);
}

function layerLabel(layer: Layer): string {
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

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/** Where a dropped image file is saved: `assets/` and the file's name, made safe for a path. */
export function assetPath(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : 'png';
  const words = (dot > 0 ? fileName.slice(0, dot) : fileName).toLowerCase().split(/[^a-z0-9]/);
  const name = words.filter(Boolean).join('-');
  return `assets/${name || 'image'}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

/**
 * A type with one field renamed, and every `{{field}}` and label that used it
 * pointing at the new name.
 */
export function withFieldRenamed(type: ComponentType, from: string, to: string): ComponentType {
  let renamed = setIn(type, ['fields'], renameKey(type.fields ?? {}, from, to));
  for (const side of ['front', 'back'] as const) {
    for (const item of itemsOf(renamed, side)) {
      if (item.label?.field === from) renamed = editType(renamed, [...item.path, 'field'], to);
    }
  }
  // Field names are letters, digits and underscores, so they need no escaping here.
  return replaceTemplates(
    renamed,
    new RegExp(`\\{\\{\\s*${from}\\s*\\}\\}`, 'g'),
    `{{${to}}}`,
  ) as ComponentType;
}

function replaceTemplates(value: unknown, from: RegExp, to: string): unknown {
  if (typeof value === 'string') return value.replace(from, to);
  if (Array.isArray(value)) return value.map((v) => replaceTemplates(v, from, to));
  if (!isTree(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, replaceTemplates(v, from, to)]),
  );
}
