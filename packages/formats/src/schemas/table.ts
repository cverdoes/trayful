// Table state, which Trayful writes and reads back.
import { z } from 'zod';
import { FORMAT_VERSION, Vec2, Scalar, FaceSide } from './common.js';

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

export type PieceObject = z.infer<typeof PieceObject>;
export type StackObject = z.infer<typeof StackObject>;
export type TableFile = z.infer<typeof TableFile>;
