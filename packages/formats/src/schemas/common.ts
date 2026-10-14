// Building blocks shared by every file kind, and the built-in primitives.
import { z } from 'zod';

export const FORMAT_VERSION = 'trayful/1';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const Slug = z
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

/** One field value in an inventory or on a piece. */
export const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Which side of a piece is up. */
export const FaceSide = z.enum(['up', 'down']);

export type Vec2 = z.infer<typeof Vec2>;
export type Size = z.infer<typeof Size>;
export type Scalar = z.infer<typeof Scalar>;
