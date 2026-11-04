// Converts a project in the first file format to the current one. The loader uses it
// to open old projects, and `trayful migrate` to rewrite their files. The result looks
// the same on the table: what has no simpler form stays in a face's advanced `layers`.
import { isTemplate } from './fields.js';
import { slugify } from './inventory.js';
import { LEGACY_PRIMITIVES } from './schemas.js';
import type {
  AssetsFile,
  Back,
  ComponentType,
  Face,
  InventoryEntry,
  Label,
  LegacyComponentType,
  LegacyFace,
  LegacyInventoryEntry,
  LegacyPrimitive,
  LegacyManifestFile,
  ManifestFile,
  SetupFile,
  SnapTarget,
} from './schemas.js';

/** The image files and palette colours of the old libraries, as one assets file. */
export class AssetCollector {
  private readonly images = new Map<string, string>();
  private readonly colors: Record<string, string> = {};

  /** The asset name for an image file: its file name, made unique. */
  image(file: string): string {
    for (const [name, path] of this.images) if (path === file) return name;
    const stem = slugify(file.replace(/^.*\//, '').replace(/\.[^.]*$/, '')) || 'image';
    let n = 1;
    while (this.images.has(n === 1 ? stem : `${stem}-${n}`)) n++;
    const name = n === 1 ? stem : `${stem}-${n}`;
    this.images.set(name, file);
    return name;
  }

  palette(colors: Record<string, string> | undefined): void {
    Object.assign(this.colors, colors);
  }

  /** The assets file, or undefined when the project uses no images or colours. */
  file(): AssetsFile | undefined {
    if (this.images.size === 0 && Object.keys(this.colors).length === 0) return undefined;
    return {
      kind: 'assets',
      ...(this.images.size ? { images: Object.fromEntries(this.images) } : {}),
      ...(Object.keys(this.colors).length ? { colors: this.colors } : {}),
    };
  }
}

const TWO_SIDED = new Set<LegacyPrimitive>(['card', 'tile', 'token']);

const isLegacyPrimitive = (name: string): name is LegacyPrimitive =>
  (LEGACY_PRIMITIVES as readonly string[]).includes(name);

/**
 * One old type as a component. `bases` maps each primitive to the ids of the types
 * built on it, so a snap target that accepted a primitive accepts those components.
 */
export function upgradeType(
  type: LegacyComponentType,
  assets: AssetCollector,
  bases: Readonly<Record<string, readonly string[]>>,
): ComponentType {
  const valued = type.base === 'die' || type.base === 'counter';
  // Behaviours come before fields and faces, as people read a component.
  const component: ComponentType = {
    id: type.id,
    ...(type.name !== undefined ? { name: type.name } : {}),
    ...(type.description !== undefined ? { description: type.description } : {}),
    size: type.size,
    is: representation(type.base),
  };
  if (TWO_SIDED.has(type.base)) Object.assign(component, twoSidedBehaviours(type, assets, bases));
  if (!valued) component.rotates = type.rotationStep ? { step: type.rotationStep } : true;
  const values = valued ? upgradeValues(type) : undefined;
  if (values) component.values = values;
  if (type.fields) component.fields = type.fields;
  const face = upgradeFront(type, assets);
  if (face) component.face = face;
  if (type.snap) component.container = type.snap.map((t) => upgradeTarget(t, bases));
  return component;
}

/**
 * How old cards, tiles and tokens behave: they flip, and stack with others of their
 * primitive, as the table let them.
 */
function twoSidedBehaviours(
  type: LegacyComponentType,
  assets: AssetCollector,
  bases: Readonly<Record<string, readonly string[]>>,
): Pick<ComponentType, 'flippable' | 'stackable'> {
  const back = type.back && upgradeSide(type.back, assets);
  const partners = (bases[type.base] ?? []).filter((id) => id !== type.id);
  return {
    flippable: back ? { back } : true,
    stackable: partners.length ? { with: partners } : true,
  };
}

function representation(base: LegacyPrimitive): ComponentType['is'] {
  if (base === 'zone' || base === 'die' || base === 'counter') return base;
  return 'piece';
}

function upgradeFront(type: LegacyComponentType, assets: AssetCollector): Face | undefined {
  const side = upgradeSide({ fill: type.fill, ...type.front }, assets) ?? {};
  const shape = type.shape ?? (type.base === 'meeple' ? 'meeple' : undefined);
  const corner = type.corner ?? (type.base === 'die' ? 2 : undefined);
  const face: Face = {
    ...(shape && shape !== 'rect' ? { shape } : {}),
    ...(corner ? { corner } : {}),
    ...side,
  };
  return Object.keys(face).length ? face : undefined;
}

/**
 * A face in the new form: image files become assets, a first image covering the
 * whole face becomes the face's image, and text becomes labels when all that is
 * left is text. Anything else stays in `layers`, drawn as before.
 */
function upgradeSide(face: LegacyFace, assets: AssetCollector): Back | undefined {
  const layers = (face.layers ?? []).map((layer) =>
    'image' in layer && !isTemplate(layer.image) && layer.image
      ? { ...layer, image: assets.image(layer.image) }
      : layer,
  );
  const side: Back = {};
  if (face.fill !== undefined) side.fill = face.fill;
  if (face.stroke !== undefined) side.stroke = face.stroke;
  const first = layers[0];
  if (first && 'image' in first && coversFace(first)) {
    side.image = first.image;
    layers.shift();
  }
  if (layers.length && layers.every((l) => 'text' in l)) {
    side.labels = layers.map((l) => toLabel(l));
  } else if (layers.length) {
    side.layers = layers;
  }
  return Object.keys(side).length ? side : undefined;
}

/** An image layer with nothing but its image: it covers the face, as a face image does. */
function coversFace(layer: Record<string, unknown>): boolean {
  const keys = Object.keys(layer).filter((k) => layer[k] !== undefined);
  const plain = keys.every((k) => k === 'image' || (k === 'fit' && layer.fit === 'cover'));
  return plain && !isTemplate(String(layer.image));
}

/** A text layer as a label; text that is just one field shows that field. */
function toLabel(layer: Omit<Label, 'field'> & { text: string }): Label {
  const field = /^\{\{\s*([a-zA-Z_]\w*)\s*\}\}$/.exec(layer.text)?.[1];
  if (!field) return layer;
  const label: Label = { ...layer, field };
  delete label.text;
  return label;
}

function upgradeTarget(
  target: SnapTarget,
  bases: Readonly<Record<string, readonly string[]>>,
): SnapTarget {
  if (!target.accepts) return target;
  // A primitive's name stands for its types; one the project has no types of took nothing.
  const accepts = target.accepts.flatMap((name) =>
    isLegacyPrimitive(name) ? (bases[name] ?? []) : [name],
  );
  return { ...target, accepts: [...new Set(accepts)] };
}

/** A die's faces or a counter's range, unless they are the defaults, which stay unwritten. */
function upgradeValues(type: LegacyComponentType): ComponentType['values'] {
  if (type.base === 'counter') {
    const [min, max] = type.range ?? [0, 99];
    return min === 0 && max === 99 ? undefined : { range: [min, max] };
  }
  const faces = type.faces ?? [1, 2, 3, 4, 5, 6];
  const first = faces[0];
  const consecutive =
    typeof first === 'number' && faces.every((f, i) => f === first + i && Number.isInteger(f));
  if (!consecutive) return { list: faces };
  const range: [number, number] = [first, first + faces.length - 1];
  return range[0] === 1 && range[1] === 6 ? undefined : { range };
}

/** The ids of the old types built on each primitive. */
export function typesByBase(types: readonly LegacyComponentType[]): Record<string, string[]> {
  const bases: Record<string, string[]> = {};
  for (const type of types) {
    bases[type.base] ??= [];
    bases[type.base]!.push(type.id);
  }
  return bases;
}

export function upgradeManifest(
  manifest: LegacyManifestFile,
  assetsFile: string | undefined,
): ManifestFile {
  const { libraries, ...rest } = manifest;
  return {
    name: rest.name,
    format: 'trayful/2',
    ...(rest.version !== undefined ? { version: rest.version } : {}),
    ...(rest.description !== undefined ? { description: rest.description } : {}),
    ...(rest.units !== undefined ? { units: rest.units } : {}),
    ...(assetsFile ? { assets: assetsFile } : {}),
    libraries,
    inventory: rest.inventory,
    ...(rest.setups !== undefined ? { setups: rest.setups } : {}),
    ...(rest.setup !== undefined ? { setup: rest.setup } : {}),
  };
}

export function upgradeEntry(entry: LegacyInventoryEntry): InventoryEntry {
  const { type, ...rest } = entry;
  return { component: type, ...rest };
}

/**
 * Old boards started locked. Setups now lock them explicitly, so a setup step that
 * places a board gets `lock: true` and the board stays put as it did.
 */
export function upgradeSetup(setup: SetupFile, boards: ReadonlySet<string>): SetupFile {
  const steps = setup.steps.map((step) => {
    if (!('place' in step) || typeof step.place !== 'string' || step.lock !== undefined)
      return step;
    const type = step.place.split(/[.~]/)[0]!;
    return boards.has(type) ? { ...step, lock: true } : step;
  });
  return { ...setup, steps };
}
