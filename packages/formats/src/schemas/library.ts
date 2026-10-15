// Component types and the library files that define them.
import { z } from 'zod';
import { FieldName, Slug, Vec2, Size, Color, Template, PRIMITIVES, SHAPES } from './common.js';

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
      .record(FieldName, Field)
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

export type Field = z.infer<typeof Field>;
export type Layer = z.infer<typeof Layer>;
export type Face = z.infer<typeof Face>;
export type SnapTarget = z.infer<typeof SnapTarget>;
export type ComponentType = z.infer<typeof ComponentType>;
export type LibraryFile = z.infer<typeof LibraryFile>;
