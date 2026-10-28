// Building blocks shared by every file kind, and the built-in primitives.
import { z } from 'zod';

/** Format of the files an author writes: the manifest, libraries, assets, inventory and setups. */
export const FORMAT_VERSION = 'trayful/2';
/** The first format, which Trayful still reads and can migrate with `trayful migrate`. */
export const LEGACY_FORMAT = 'trayful/1';
/** Format of saved table files, which did not change with the project format. */
export const TABLE_FORMAT = 'trayful/1';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const Slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes, e.g. "action-card".');

/** A field name, usable as `{{name}}` in faces and as a CSV column. */
export const FieldName = z
  .string()
  .regex(
    /^[a-zA-Z_]\w*$/,
    'Start with a letter or "_", then use letters, digits and "_", e.g. "cost" or "art_2".',
  );

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
    'A CSS colour (`"#d94b3d"`, `"white"`, `"transparent"`), a colour name from the assets file, or a `{{field}}` template that resolves to one.',
});

/** A string that may contain `{{field}}` placeholders, filled from each component's data. */
export const Template = z.string().meta({
  id: 'Template',
  description:
    "Text that may contain `{{field}}` placeholders, filled in from each component's data.",
});

// ---------------------------------------------------------------------------
// Representations
// ---------------------------------------------------------------------------

/** What a component is on the table. Its behaviours (flipping, stacking...) are separate properties. */
export const REPRESENTATIONS = ['piece', 'zone', 'die', 'counter', 'stamp'] as const;
export type Representation = (typeof REPRESENTATIONS)[number];

/** What each representation is for, shown in the editor and the reference. */
export const REPRESENTATION_INFO: Record<Representation, { summary: string; valued: boolean }> = {
  piece: {
    summary: 'Anything you pick up and move: cards, tiles, tokens, meeples, boards.',
    valued: false,
  },
  zone: { summary: 'A marked area of the table, drawn as a dashed outline.', valued: false },
  die: { summary: 'Shows one of its values; rolls to a random one.', valued: true },
  counter: { summary: 'Shows one of its values; steps up and down.', valued: true },
  stamp: {
    summary: 'A mark pressed onto a stamp spot of a sheet, as often as you like; it never moves.',
    valued: false,
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

/** One field value in an inventory or on a piece. */
export const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Which side of a piece is up. */
export const FaceSide = z.enum(['up', 'down']);

export type Vec2 = z.infer<typeof Vec2>;
export type Size = z.infer<typeof Size>;
export type Scalar = z.infer<typeof Scalar>;
