// The files an author writes besides libraries and assets: the manifest, the inventory and setups.
import { z } from 'zod';
import { FORMAT_VERSION, LEGACY_FORMAT, Slug, Vec2, Scalar, FaceSide } from './common.js';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const ManifestFile = z
  .strictObject({
    name: z.string().min(1).describe('Name of the prototype.'),
    format: z
      .literal(FORMAT_VERSION)
      .describe(
        `File format version, \`${FORMAT_VERSION}\`. Projects in \`${LEGACY_FORMAT}\` still open; \`trayful migrate\` rewrites them.`,
      ),
    version: z
      .string()
      .optional()
      .describe('Your own version label for the prototype, e.g. `0.3`.'),
    description: z.string().optional(),
    units: z
      .literal('mm')
      .optional()
      .describe('Unit for all sizes and positions. Only `mm` for now.'),
    assets: z
      .string()
      .optional()
      .describe('Path to the assets file. Default `assets.yaml`, when the project has one.'),
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

export const InventoryRow = z.record(z.string(), Scalar).meta({
  id: 'InventoryRow',
  description:
    "Field values for one design. Keys are the component's fields (including `tile` when it picks its own tile), plus optional `count` (copies, default 1) and `id` (a stable id prefix).",
});

export const InventoryEntry = z
  .strictObject({
    component: z.string().describe('Component id from a library.'),
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
      'A group of components of one kind. Use at most one of `items`, `from` or `each`; with none, the entry is one design.',
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
    'Where something goes: an `[x, y]` table position, or a drop area as `component/area` or `component/area/index` (e.g. `main-board/market/2`).',
});

const Ref = z
  .union([z.string(), z.strictObject({ deck: z.string() })])
  .describe(
    'A component id from a library (places every one of them in the inventory), the id of one of them, or `{ deck: <name> }`.',
  );

export const PlaceStep = z
  .strictObject({
    place: Ref,
    at: Target,
    face: FaceSide.optional().describe('Turn face up or down.'),
    rot: z.number().optional().describe('Rotation in degrees.'),
    shuffle: z.boolean().optional().describe('Shuffle a deck after placing it.'),
    lock: z
      .boolean()
      .optional()
      .describe('Lock it in place, as a board usually is once it is where it belongs.'),
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

export type ManifestFile = z.infer<typeof ManifestFile>;
export type InventoryEntry = z.infer<typeof InventoryEntry>;
export type InventoryFile = z.infer<typeof InventoryFile>;
export type SetupStep = z.infer<typeof SetupStep>;
export type SetupFile = z.infer<typeof SetupFile>;
