// The first file format, `trayful/1`. Trayful still reads it, converting it to the
// current format as it loads, and `trayful migrate` rewrites a project in the new one.
import { z } from 'zod';
import { Color, LEGACY_FORMAT, Scalar, Size, Slug } from './common.js';
import { Field, Layer, SnapTarget } from './library.js';

export const LEGACY_PRIMITIVES = [
  'card',
  'board',
  'tile',
  'token',
  'meeple',
  'die',
  'counter',
  'zone',
] as const;
export type LegacyPrimitive = (typeof LEGACY_PRIMITIVES)[number];

const LEGACY_SHAPES = [
  'rect',
  'circle',
  'ellipse',
  'hex',
  'triangle',
  'meeple',
  'cube',
  'disc',
] as const;

export const LegacyFace = z.strictObject({
  fill: Color.optional(),
  stroke: Color.optional(),
  layers: z.array(Layer).optional(),
});

export const LegacyComponentType = z.strictObject({
  id: Slug,
  base: z.enum(LEGACY_PRIMITIVES),
  name: z.string().optional(),
  description: z.string().optional(),
  size: Size,
  shape: z.enum(LEGACY_SHAPES).optional(),
  corner: z.number().nonnegative().optional(),
  fill: Color.optional(),
  fields: z.record(z.string(), Field).optional(),
  front: LegacyFace.optional(),
  back: LegacyFace.optional(),
  rotationStep: z.number().positive().max(360).optional(),
  snap: z.array(SnapTarget).optional(),
  range: z.tuple([z.int(), z.int()]).optional(),
  faces: z
    .array(z.union([z.string(), z.number()]))
    .min(2)
    .optional(),
});

export const LegacyLibraryFile = z.strictObject({
  kind: z.literal('library'),
  palette: z.record(z.string(), z.string()).optional(),
  types: z.array(LegacyComponentType),
});

export const LegacyManifestFile = z.strictObject({
  name: z.string().min(1),
  format: z.literal(LEGACY_FORMAT),
  version: z.string().optional(),
  description: z.string().optional(),
  units: z.literal('mm').optional(),
  libraries: z.array(z.string()).min(1),
  inventory: z.string(),
  setups: z.array(z.string()).optional(),
  setup: z.string().optional(),
});

export const LegacyInventoryEntry = z.strictObject({
  type: z.string(),
  count: z.int().positive().optional(),
  deck: Slug.optional(),
  data: z.record(z.string(), Scalar).optional(),
  items: z.array(z.record(z.string(), Scalar)).optional(),
  from: z.string().optional(),
  each: z.record(z.string(), z.array(Scalar).min(1)).optional(),
});

export const LegacyInventoryFile = z.strictObject({
  kind: z.literal('inventory'),
  components: z.array(LegacyInventoryEntry),
});

export type LegacyFace = z.infer<typeof LegacyFace>;
export type LegacyComponentType = z.infer<typeof LegacyComponentType>;
export type LegacyLibraryFile = z.infer<typeof LegacyLibraryFile>;
export type LegacyManifestFile = z.infer<typeof LegacyManifestFile>;
export type LegacyInventoryEntry = z.infer<typeof LegacyInventoryEntry>;
export type LegacyInventoryFile = z.infer<typeof LegacyInventoryFile>;
