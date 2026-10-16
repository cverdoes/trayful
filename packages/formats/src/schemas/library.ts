// Components and the library files that define them.
import { z } from 'zod';
import { FieldName, Slug, Vec2, Size, Color, Template, REPRESENTATIONS, SHAPES } from './common.js';

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

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

const FIT = z.enum(['cover', 'contain', 'stretch']);

export const ImageRef = z
  .union([
    Slug.describe('An image asset by name: the whole image.'),
    z.strictObject({
      asset: Slug.describe('Name of an image in the assets file.'),
      tile: z
        .union([z.int().nonnegative(), z.literal('instance'), z.literal('value')])
        .optional()
        .describe(
          'One tile of a tiled image, counted left to right, then top to bottom, from 0. `instance` lets each component pick its tile with a `tile` value in the inventory; `value` shows the tile of a die or counter value.',
        ),
      row: z.int().nonnegative().optional().describe('Row of the tile, from 0. Use with `col`.'),
      col: z.int().nonnegative().optional().describe('Column of the tile, from 0. Use with `row`.'),
      fit: FIT.optional().describe('How the image fills the face. Default `cover`.'),
    }),
  ])
  .meta({
    id: 'ImageRef',
    description:
      'An image from the assets file: its name for the whole image, or `{ asset, tile }` (or `row` and `col`) for one tile of a tiled image.',
  });

export const Label = z
  .strictObject({
    text: Template.optional().describe('Fixed text. May hold `{{field}}` placeholders.'),
    field: FieldName.optional().describe(
      'A field whose value each component shows. A field the component does not declare becomes a text field.',
    ),
    ...LayerCommon,
    width: z
      .number()
      .positive()
      .optional()
      .describe('Wrap width in millimetres. Default: no wrapping.'),
    align: z.enum(['left', 'center', 'right']).optional().describe('Default `left`.'),
    valign: z.enum(['top', 'middle', 'bottom']).optional().describe('Default `top`.'),
    font: Font.optional(),
    color: Color.optional().describe('Text colour. Default black.'),
  })
  .meta({
    id: 'Label',
    description: 'Text on a face: fixed `text`, or the value of a `field`. Give one of the two.',
  });

const SideCommon = {
  fill: Color.optional().describe('Background colour. `transparent` shows the table through.'),
  stroke: Color.optional().describe('Outline colour.'),
  image: ImageRef.optional().describe('An image covering the face.'),
  labels: z.array(Label).optional().describe('Text drawn over the face, in order.'),
  layers: z
    .array(Layer)
    .optional()
    .describe(
      'Advanced: shapes, images and text drawn in order over the image and under the labels.',
    ),
};

export const Face = z
  .strictObject({
    shape: z.enum(SHAPES).optional().describe('Outline of the component. Default `rect`.'),
    corner: z
      .number()
      .nonnegative()
      .optional()
      .describe('Corner radius in millimetres, for rectangles.'),
    ...SideCommon,
  })
  .meta({ id: 'Face', description: 'How a component looks: its outline and its front side.' });

export const Back = z.strictObject(SideCommon).meta({
  id: 'Back',
  description:
    "The back of a flippable component. It has the front's outline. Fields it uses are shown to everyone while the component lies face down.",
});

// ---------------------------------------------------------------------------
// Snap targets
// ---------------------------------------------------------------------------

/** What a drop area does with what lands in it: modes for spots, then modes for areas. */
export const SPOT_MODES = ['single', 'pile'] as const;
export const AREA_MODES = ['free', 'row', 'bag'] as const;
const DROP_MODES = [...SPOT_MODES, ...AREA_MODES] as const;

export const SnapTarget = z
  .strictObject({
    id: Slug.describe(
      'Name of the drop area, used in setups and by agents as `component/area/index`.',
    ),
    accepts: z
      .array(z.string())
      .optional()
      .describe(
        'Component ids, or representations (`piece`, `zone`, `die`, `counter`), that may snap here. Default: anything.',
      ),
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
      .describe('An area: components dropped inside it stay in it, as its `mode` says.'),
    mode: z
      .enum(DROP_MODES)
      .optional()
      .describe(
        'What the drop area does with what is dropped in it. Spots (`grid`, `points`): `single` (default) holds one thing per spot; `pile` piles everything dropped on a spot into one stack, like a discard pile. Areas: `free` (default) leaves things where they are dropped; `row` lines them up side by side, left to right; `bag` hides them from everyone, to be drawn at random.',
      ),
  })
  .meta({
    id: 'SnapTarget',
    description:
      'A drop area of a container: where other components snap when dropped on it. Give exactly one of `grid`, `points` or `area`.',
  });

// ---------------------------------------------------------------------------
// Behaviours
// ---------------------------------------------------------------------------

/** A behaviour switched on with `true`, or with an object of its options. */
function toggle<S extends z.ZodType>(options: S) {
  return z.union([z.literal(true), options]);
}

export const Flippable = toggle(
  z.strictObject({ back: Back.optional().describe('How the back looks. Default: a plain back.') }),
).meta({ id: 'Flippable', description: 'The component has a back and can be turned over.' });

export const Rotates = toggle(
  z.strictObject({
    step: z.number().positive().max(360).optional().describe('Degrees per turn. Default 90.'),
  }),
).meta({ id: 'Rotates', description: 'The component can be turned on the table.' });

export const Stackable = toggle(
  z.strictObject({
    with: z
      .array(Slug)
      .optional()
      .describe('Other components it may share a stack with. It always stacks with itself.'),
  }),
).meta({
  id: 'Stackable',
  description: 'Components of this kind pile up into stacks, like decks.',
});

export const CONTROLS = ['roll', 'step'] as const;

export const Values = z
  .strictObject({
    range: z
      .tuple([z.int(), z.int()])
      .optional()
      .describe('`[min, max]`: every whole number from min to max.'),
    list: z
      .array(z.union([z.string(), z.number()]))
      .min(2)
      .optional()
      .describe('The values in order, e.g. `[sword, shield, sword, skull, blank, blank]`.'),
    controls: z
      .array(z.enum(CONTROLS))
      .min(1)
      .optional()
      .describe(
        '`roll` picks a random value, `step` goes up or down. Default: `roll` for dice, `step` for counters.',
      ),
  })
  .meta({
    id: 'Values',
    description:
      'The values of a die or counter: a `range` or a `list`. Default `range: [1, 6]` for dice and `range: [0, 99]` for counters.',
  });

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const ComponentType = z
  .strictObject({
    id: Slug.describe(
      'Unique id of the component within the project. Referenced from the inventory and setups.',
    ),
    name: z.string().optional().describe('Display name. Default: the id.'),
    description: z.string().optional(),
    size: Size.describe('Width and height in millimetres, or one number for a square.'),
    is: z.enum(REPRESENTATIONS).describe('What the component is on the table.'),
    fields: z
      .record(FieldName, Field)
      .optional()
      .describe('Per-component data, filled by the inventory and usable as `{{field}}` in faces.'),
    face: Face.optional().describe('Its outline and front side.'),
    flippable: Flippable.optional().describe('Pieces and zones only.'),
    rotates: Rotates.optional().describe('Pieces and zones only.'),
    stackable: Stackable.optional().describe('Pieces and zones only.'),
    container: z
      .array(SnapTarget)
      .min(1)
      .optional()
      .describe(
        'Drop areas: other components dropped there snap to this one and move with it. Pieces and zones only.',
      ),
    values: Values.optional().describe('Dice and counters only.'),
  })
  .meta({
    id: 'Component',
    description:
      'A kind of component: its size, what it is, how it looks and which behaviours it has.',
  });

export const LibraryFile = z
  .strictObject({
    kind: z.literal('library').describe('Marks this file as a library.'),
    components: z.array(ComponentType).describe('Components defined in this file.'),
  })
  .meta({
    id: 'Library',
    title: 'Trayful library',
    description: 'Defines components: their size, what they are, how they look and behave.',
  });

export type Field = z.infer<typeof Field>;
export type Layer = z.infer<typeof Layer>;
export type ImageRef = z.infer<typeof ImageRef>;
export type Label = z.infer<typeof Label>;
export type Face = z.infer<typeof Face>;
export type Back = z.infer<typeof Back>;
export type SnapTarget = z.infer<typeof SnapTarget>;
export type DropMode = (typeof DROP_MODES)[number];
export type Values = z.infer<typeof Values>;
export type Control = (typeof CONTROLS)[number];
export type ComponentType = z.infer<typeof ComponentType>;
export type LibraryFile = z.infer<typeof LibraryFile>;
