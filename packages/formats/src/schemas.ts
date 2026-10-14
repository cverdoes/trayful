import { z } from 'zod';

/**
 * Zod schemas for every Trayful file kind. These are the single source of truth:
 * the loader validates against them, the JSON Schemas in `schema/` are exported
 * from them, and the format reference in `docs/reference/` is generated from them.
 * Descriptions written here end up in the reference docs, so keep them user-facing.
 */

export const FORMAT_VERSION = 'trayful/1';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const Slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes, e.g. "action-card".');

export const Vec2 = z
  .tuple([z.number(), z.number()])
  .meta({ id: 'Vec2', description: 'An `[x, y]` pair in millimetres.' });

export const Size = z
  .union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])])
  .meta({
    id: 'Size',
    description:
      'A size in millimetres: one number for square or round pieces, or `[width, height]`.',
  });

export const Color = z.string().min(1).meta({
  id: 'Color',
  description:
    'A CSS colour (`"#d94b3d"`, `"white"`), a name from the library `palette`, or a `{{field}}` template that resolves to one.',
});

/** A string that may contain `{{field}}` placeholders, filled from each component's data. */
export const Template = z.string().meta({
  id: 'Template',
  description:
    "Text that may contain `{{field}}` placeholders, filled in from each component's data.",
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const PRIMITIVES = [
  'card',
  'board',
  'tile',
  'token',
  'meeple',
  'die',
  'counter',
  'zone',
] as const;
export type Primitive = (typeof PRIMITIVES)[number];

/** Behaviour of each built-in primitive. Used by the loader and by the core engine. */
export const PRIMITIVE_INFO: Record<
  Primitive,
  { sides: 1 | 2; stackable: boolean; snapTargets: boolean; summary: string }
> = {
  card: { sides: 2, stackable: true, snapTargets: false, summary: 'Two-sided, stacks into decks.' },
  board: {
    sides: 1,
    stackable: false,
    snapTargets: true,
    summary: 'Large surface that declares snap spots; locked by default.',
  },
  tile: {
    sides: 2,
    stackable: true,
    snapTargets: true,
    summary: 'Two-sided piece that can also hold snap spots.',
  },
  token: {
    sides: 2,
    stackable: true,
    snapTargets: false,
    summary: 'Small flat piece; may have two sides.',
  },
  meeple: {
    sides: 1,
    stackable: false,
    snapTargets: false,
    summary: 'Standing figure drawn from a silhouette.',
  },
  die: { sides: 1, stackable: false, snapTargets: false, summary: 'Rolls to one of its `faces`.' },
  counter: {
    sides: 1,
    stackable: false,
    snapTargets: false,
    summary: 'Holds a number within its `range`.',
  },
  zone: {
    sides: 1,
    stackable: false,
    snapTargets: true,
    summary: 'Invisible or outlined table area with snap spots.',
  },
};

export const SHAPES = [
  'rect',
  'circle',
  'ellipse',
  'hex',
  'triangle',
  'meeple',
  'cube',
  'disc',
] as const;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const FIELD_TYPES = ['string', 'int', 'number', 'bool', 'image', 'color'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const FieldShorthand = z
  .string()
  .regex(
    /^(string|int|number|bool|image|color)\??$/,
    'Use one of string, int, number, bool, image, color (add "?" for optional), or an object.',
  )
  .meta({
    description: 'Shorthand: a field type name, with a trailing `?` when the field is optional.',
  });

const FieldObject = z
  .strictObject({
    type: z
      .enum(FIELD_TYPES)
      .optional()
      .describe('Field type. Defaults to `string`, or `enum` when `enum` is given.'),
    enum: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .optional()
      .describe('Allowed values. Inventory rows must use one of these.'),
    default: z
      .union([z.string(), z.number(), z.boolean()])
      .optional()
      .describe('Value used when a row leaves the field out.'),
    optional: z
      .boolean()
      .optional()
      .describe('When true, rows may leave the field out without a default.'),
    description: z
      .string()
      .optional()
      .describe('What the field means; shown in the editor and to agents.'),
  })
  .meta({ description: 'Full field definition.' });

export const Field = z.union([FieldShorthand, FieldObject]).meta({
  id: 'Field',
  description:
    'A data field on a component type, filled per component by the inventory. Either a shorthand string such as `"int"` or `"image?"`, or an object.',
});

// ---------------------------------------------------------------------------
// Faces and layers
// ---------------------------------------------------------------------------

const Font = z.strictObject({
  size: z.number().positive().optional().describe('Font size in points. Default 10.'),
  weight: z.enum(['normal', 'bold']).optional().describe('Default `normal`.'),
  family: z.string().optional().describe("CSS font family. Default is the app's sans-serif."),
  style: z.enum(['normal', 'italic']).optional(),
});

const LayerCommon = {
  at: Vec2.optional().describe(
    "Position of the layer's anchor, from the face's top-left corner. Default `[0, 0]`.",
  ),
  rotate: z.number().optional().describe('Rotation in degrees, clockwise.'),
  opacity: z.number().min(0).max(1).optional(),
  when: Template.optional().describe(
    'Only draw this layer when the template resolves to a non-empty value other than `false` or `0`.',
  ),
};

export const TextLayer = z
  .strictObject({
    text: Template.describe('The text to draw. Supports `{{field}}` placeholders.'),
    ...LayerCommon,
    width: z
      .number()
      .positive()
      .optional()
      .describe('Wrap width in millimetres. Default: no wrapping.'),
    align: z
      .enum(['left', 'center', 'right'])
      .optional()
      .describe('Horizontal alignment around `at`. Default `left`.'),
    valign: z
      .enum(['top', 'middle', 'bottom'])
      .optional()
      .describe('Vertical alignment around `at`. Default `top`.'),
    font: Font.optional(),
    color: Color.optional().describe('Text colour. Default black.'),
  })
  .meta({ id: 'TextLayer', description: 'Draws text.' });

export const ImageLayer = z
  .strictObject({
    image: Template.describe(
      'Path to an image or SVG, relative to the project folder, or a `{{field}}` of type `image`.',
    ),
    ...LayerCommon,
    size: Size.optional().describe('Drawn size. Default: the whole face.'),
    fit: z
      .enum(['cover', 'contain', 'stretch'])
      .optional()
      .describe('How the image fills `size`. Default `cover`.'),
  })
  .meta({ id: 'ImageLayer', description: 'Draws an image file.' });

export const ShapeLayer = z
  .strictObject({
    shape: z.enum(SHAPES).describe('The shape to draw.'),
    ...LayerCommon,
    size: Size.optional().describe('Bounding size. Use this or `r`.'),
    r: z
      .number()
      .positive()
      .optional()
      .describe('Radius, for circles and hexes. `at` is then the centre.'),
    fill: Color.optional(),
    stroke: Color.optional(),
    strokeWidth: z.number().nonnegative().optional().describe('Outline width in millimetres.'),
  })
  .meta({ id: 'ShapeLayer', description: 'Draws a filled or outlined shape.' });

export const Layer = z.union([TextLayer, ImageLayer, ShapeLayer]).meta({
  id: 'Layer',
  description:
    'One drawing step on a face. Exactly one of `text`, `image` or `shape` decides the kind.',
});

export const Face = z
  .strictObject({
    fill: Color.optional().describe('Background colour of the face.'),
    stroke: Color.optional().describe('Outline colour.'),
    layers: z.array(Layer).optional().describe('Drawn in order, so later layers sit on top.'),
  })
  .meta({ id: 'Face', description: 'How one side of a component looks.' });

// ---------------------------------------------------------------------------
// Snap targets
// ---------------------------------------------------------------------------

export const SnapTarget = z
  .strictObject({
    id: Slug.describe(
      'Name of the snap target, used in setups and by agents as `type/target/index`.',
    ),
    accepts: z
      .array(z.string())
      .optional()
      .describe('Type ids or primitive names that may snap here. Default: anything.'),
    grid: z
      .strictObject({
        origin: Vec2.describe('Centre of the first cell.'),
        cols: z.int().positive(),
        rows: z.int().positive(),
        cell: Size.describe('Distance between cell centres.'),
      })
      .optional()
      .describe('A regular grid of spots, numbered left to right, then top to bottom, from 0.'),
    points: z
      .array(Vec2)
      .min(1)
      .optional()
      .describe('An ordered list of spots, such as a score track.'),
    area: z
      .strictObject({ at: Vec2.describe('Top-left corner.'), size: Size })
      .optional()
      .describe('A free area: pieces snap inside it but keep their own position.'),
  })
  .meta({
    id: 'SnapTarget',
    description:
      'Where pieces snap on a board, tile or zone. Give exactly one of `grid`, `points` or `area`.',
  });

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export const ComponentType = z
  .strictObject({
    id: Slug.describe(
      'Unique id of the type within the project. Referenced from the inventory and setups.',
    ),
    base: z.enum(PRIMITIVES).describe('The built-in primitive this type behaves like.'),
    name: z.string().optional().describe('Display name. Default: the id.'),
    description: z.string().optional(),
    size: Size.describe('Physical size in millimetres.'),
    shape: z
      .enum(SHAPES)
      .optional()
      .describe('Outline for tokens, meeples and tiles. Default `rect` (`meeple` for meeples).'),
    corner: z
      .number()
      .nonnegative()
      .optional()
      .describe('Corner radius in millimetres, for rectangular shapes.'),
    fill: Color.optional().describe('Shorthand for `front.fill`.'),
    fields: z
      .record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/), Field)
      .optional()
      .describe('Per-component data, filled by the inventory and usable as `{{field}}` in faces.'),
    front: Face.optional().describe('The face-up side.'),
    back: Face.optional().describe(
      'The face-down side. Only for two-sided primitives (card, tile, token).',
    ),
    rotationStep: z
      .number()
      .positive()
      .max(360)
      .optional()
      .describe('Degrees per rotate step. Default 90.'),
    snap: z
      .array(SnapTarget)
      .optional()
      .describe('Snap targets. Only for boards, tiles and zones.'),
    range: z
      .tuple([z.int(), z.int()])
      .optional()
      .describe('`[min, max]` for counters. Default `[0, 99]`.'),
    faces: z
      .array(z.union([z.string(), z.number()]))
      .min(2)
      .optional()
      .describe('Die faces, e.g. `[1, 2, 3, 4, 5, 6]`. Only for dice. Default six faces 1 to 6.'),
  })
  .meta({
    id: 'ComponentType',
    description: 'A kind of component: what it is, its data fields and how it looks.',
  });

export const LibraryFile = z
  .strictObject({
    kind: z.literal('library').describe('Marks this file as a library.'),
    palette: z
      .record(z.string(), z.string())
      .optional()
      .describe('Named colours usable anywhere a colour is expected.'),
    types: z.array(ComponentType).describe('Component types defined in this file.'),
  })
  .meta({
    id: 'Library',
    title: 'Trayful library',
    description: 'Defines component types: their primitive, size, data fields and faces.',
  });

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const ManifestFile = z
  .strictObject({
    name: z.string().min(1).describe('Name of the prototype.'),
    format: z
      .literal(FORMAT_VERSION)
      .describe(`File format version. Currently always \`${FORMAT_VERSION}\`.`),
    version: z
      .string()
      .optional()
      .describe('Your own version label for the prototype, e.g. `0.3`.'),
    description: z.string().optional(),
    units: z
      .literal('mm')
      .optional()
      .describe('Unit for all sizes and positions. Only `mm` for now.'),
    libraries: z
      .array(z.string())
      .min(1)
      .describe('Library files to load, as paths or glob patterns relative to the project folder.'),
    inventory: z.string().describe('Path to the inventory file.'),
    setups: z
      .array(z.string())
      .optional()
      .describe('Setup files, as paths or globs. Default `["setups/*.yaml"]`.'),
    setup: z
      .string()
      .optional()
      .describe(
        'Setup a new table starts from, by file name without `.yaml` (e.g. `2-player`). Default: everything laid out in rows.',
      ),
  })
  .meta({
    id: 'Manifest',
    title: 'Trayful project manifest',
    description: 'The `trayful.yaml` file at the root of a project folder.',
  });

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

export const InventoryRow = z.record(z.string(), Scalar).meta({
  id: 'InventoryRow',
  description:
    "Field values for one design. Keys are the type's fields, plus optional `count` (copies, default 1) and `id` (a stable id prefix).",
});

export const InventoryEntry = z
  .strictObject({
    type: z.string().describe('Component type id from a library.'),
    count: z
      .int()
      .positive()
      .optional()
      .describe('Copies of each design in this entry. Default 1.'),
    deck: Slug.optional().describe(
      'Group these components into a named deck that spawns as one stack.',
    ),
    data: z
      .record(z.string(), Scalar)
      .optional()
      .describe('Field values shared by every component in this entry.'),
    items: z
      .array(InventoryRow)
      .optional()
      .describe('One row per design, each with its own field values.'),
    from: z
      .string()
      .optional()
      .describe(
        'CSV file with one row per design. The header row names the fields; a `count` column is allowed.',
      ),
    each: z
      .record(z.string(), z.array(Scalar).min(1))
      .optional()
      .describe(
        'Make one design per combination of these field values, e.g. `{ color: [red, blue] }`.',
      ),
  })
  .meta({
    id: 'InventoryEntry',
    description:
      'A group of components of one type. Use at most one of `items`, `from` or `each`; with none, the entry is one design.',
  });

export const InventoryFile = z
  .strictObject({
    kind: z.literal('inventory').describe('Marks this file as an inventory.'),
    components: z.array(InventoryEntry).describe('Everything in the box.'),
  })
  .meta({
    id: 'Inventory',
    title: 'Trayful inventory',
    description: 'The physical contents of the box: which components exist and how many.',
  });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export const Target = z.union([Vec2, z.string()]).meta({
  id: 'Target',
  description:
    'Where something goes: an `[x, y]` table position, or a snap target as `type/target` or `type/target/index` (e.g. `main-board/market/2`).',
});

const Ref = z
  .union([z.string(), z.strictObject({ deck: z.string() })])
  .describe(
    'A component type id (places every component of that type), a component id, or `{ deck: <name> }`.',
  );

const FaceSide = z.enum(['up', 'down']);

export const PlaceStep = z
  .strictObject({
    place: Ref,
    at: Target,
    face: FaceSide.optional().describe('Turn face up or down.'),
    rot: z.number().optional().describe('Rotation in degrees.'),
    shuffle: z.boolean().optional().describe('Shuffle a deck after placing it.'),
  })
  .meta({ id: 'PlaceStep', description: 'Put components or a deck somewhere on the table.' });

export const DealStep = z
  .strictObject({
    deal: z.strictObject({
      from: z.string().describe('Deck name.'),
      to: Target.describe('A snap target fills its spots in order; a position stacks the cards.'),
      count: z.int().positive().describe('Number of cards to deal.'),
      face: FaceSide.optional(),
    }),
  })
  .meta({ id: 'DealStep', description: 'Deal cards from the top of a deck.' });

export const ShuffleStep = z
  .strictObject({ shuffle: z.string().describe('Deck name.') })
  .meta({ id: 'ShuffleStep', description: 'Shuffle a deck.' });

export const SetupStep = z.union([PlaceStep, DealStep, ShuffleStep]).meta({
  id: 'SetupStep',
  description:
    'One setup instruction. The first key (`place`, `deal` or `shuffle`) decides the kind.',
});

export const SetupFile = z
  .strictObject({
    kind: z.literal('setup').describe('Marks this file as a setup.'),
    name: z.string().optional().describe('Display name. Default: the file name.'),
    description: z.string().optional(),
    steps: z.array(SetupStep).describe('Run in order on an empty table.'),
  })
  .meta({
    id: 'Setup',
    title: 'Trayful setup',
    description: 'A scripted starting layout that a table can be reset to.',
  });

// ---------------------------------------------------------------------------
// Table state (written by Trayful)
// ---------------------------------------------------------------------------

export const PieceObject = z
  .strictObject({
    kind: z.literal('piece').describe('Marks a single piece.'),
    id: z.string().describe('Stable component id from the inventory.'),
    type: z.string().describe('Component type id.'),
    data: z.record(z.string(), Scalar).optional().describe('Field values of this component.'),
    pos: Vec2.describe('Centre position on the table, in millimetres.'),
    rot: z.number().describe('Rotation in degrees.'),
    face: FaceSide.describe('Which side is up.'),
    z: z.int().describe('Draw order; higher is on top.'),
    locked: z.boolean().optional().describe('Locked pieces ignore moves from the UI.'),
    value: z
      .union([z.number(), z.string()])
      .optional()
      .describe('Current value of a counter or the face shown by a die.'),
    parent: z
      .string()
      .optional()
      .describe('Id of the stack holding this piece. Its `pos` is then unused.'),
    snap: z.string().optional().describe('Snap spot the piece sits in, as `pieceId/target/index`.'),
    hand: z
      .string()
      .optional()
      .describe(
        'Id of the player whose private hand holds this piece. Only that player sees it; its `pos` is then unused.',
      ),
  })
  .meta({ id: 'PieceObject', description: 'One component on the table.' });

export const StackObject = z
  .strictObject({
    kind: z.literal('stack').describe('Marks a stack.'),
    id: z
      .string()
      .describe(
        '`deck:<name>` for decks from the inventory, `stack:<n>` for stacks made on the table.',
      ),
    name: z.string().optional().describe('Deck name, when the stack came from one.'),
    pos: Vec2.describe('Centre position on the table, in millimetres.'),
    rot: z.number().describe('Rotation in degrees.'),
    z: z.int().describe('Draw order; higher is on top.'),
    items: z.array(z.string()).describe('Piece ids from bottom to top.'),
    locked: z.boolean().optional().describe('Locked stacks ignore moves from the UI.'),
    snap: z.string().optional().describe('Snap spot the stack sits in, as `pieceId/target/index`.'),
    layout: z
      .enum(['pile', 'fan', 'spread'])
      .optional()
      .describe(
        'How the pieces lie: `pile` (default) shows only the top, `fan` overlaps them in a row, `spread` lays them side by side.',
      ),
  })
  .meta({ id: 'StackObject', description: 'An ordered pile of pieces, such as a deck.' });

export const TableFile = z
  .strictObject({
    format: z.literal(FORMAT_VERSION).describe(`File format version, \`${FORMAT_VERSION}\`.`),
    table: z.string().describe('Table name.'),
    seed: z.int().describe('Seed the table was created with.'),
    rng: z.int().describe('Current random generator state, so shuffles and rolls replay exactly.'),
    objects: z
      .array(z.union([PieceObject, StackObject]))
      .describe('Every piece and stack, sorted by id.'),
  })
  .meta({
    id: 'Table',
    title: 'Trayful table state',
    description: 'A saved table. Written by Trayful; not meant to be edited by hand.',
  });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Vec2 = z.infer<typeof Vec2>;
export type Size = z.infer<typeof Size>;
export type Field = z.infer<typeof Field>;
export type Layer = z.infer<typeof Layer>;
export type Face = z.infer<typeof Face>;
export type SnapTarget = z.infer<typeof SnapTarget>;
export type ComponentType = z.infer<typeof ComponentType>;
export type LibraryFile = z.infer<typeof LibraryFile>;
export type ManifestFile = z.infer<typeof ManifestFile>;
export type InventoryEntry = z.infer<typeof InventoryEntry>;
export type InventoryFile = z.infer<typeof InventoryFile>;
export type SetupStep = z.infer<typeof SetupStep>;
export type SetupFile = z.infer<typeof SetupFile>;
export type PieceObject = z.infer<typeof PieceObject>;
export type StackObject = z.infer<typeof StackObject>;
export type TableFile = z.infer<typeof TableFile>;
export type Scalar = z.infer<typeof Scalar>;

/** Every file kind with its schema, in the order the reference lists them. */
export const FILE_KINDS = {
  manifest: ManifestFile,
  library: LibraryFile,
  inventory: InventoryFile,
  setup: SetupFile,
  table: TableFile,
} as const;
export type FileKind = keyof typeof FILE_KINDS;
