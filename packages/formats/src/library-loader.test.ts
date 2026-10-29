import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './diagnostics.js';
import { tileChoices } from './library-loader.js';
import { loadProject } from './load.js';
import type { ComponentType } from './schemas.js';

const MANIFEST =
  'name: Test\nformat: trayful/2\nlibraries: [lib.yaml]\ninventory: inventory.yaml\n';
const ASSETS = [
  'kind: assets',
  'images:',
  '  art: art.svg',
  '  sheet: { file: sheet.png, rows: 2, cols: 3 }',
  'colors: { red: "#c00" }',
].join('\n');

/** Loads a project with these components, an assets file and an empty inventory. */
async function load(components: string[], files: Record<string, string> = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-'));
  const all: Record<string, string> = {
    'trayful.yaml': MANIFEST,
    'assets.yaml': ASSETS,
    'art.svg': '<svg/>',
    'sheet.png': '',
    'lib.yaml': components.length
      ? ['kind: library', 'components:', ...components].join('\n')
      : 'kind: library\ncomponents: []\n',
    'inventory.yaml': 'kind: inventory\ncomponents: []\n',
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return loadProject(dir);
}

const messages = async (components: string[], files?: Record<string, string>) =>
  (await load(components, files)).diagnostics.map((d) => formatDiagnostic(d));

describe('LibraryLoader', () => {
  it('loads the assets file with its tiling and colours', async () => {
    const result = await load(['  - { id: card, size: 10, is: piece, face: { image: art } }']);
    expect(result.diagnostics).toEqual([]);
    expect(result.project!.assets).toEqual({
      images: {
        art: { file: 'art.svg', rows: 1, cols: 1 },
        sheet: { file: 'sheet.png', rows: 2, cols: 3 },
      },
      colors: { red: '#c00' },
    });
  });

  it('reports face images that name no asset, and tiles the image does not have', async () => {
    expect(
      await messages([
        '  - id: a',
        '    size: 10',
        '    is: piece',
        '    face: { image: nope }',
        '    flippable: { back: { image: { asset: sheet, tile: 6 } } }',
        '  - { id: b, size: 10, is: piece, face: { image: { asset: sheet, row: 2, col: 0 } } }',
        '  - { id: c, size: 10, is: piece, face: { image: { asset: sheet, row: 0, col: 3 } } }',
        '  - { id: d, size: 10, is: piece, face: { image: { asset: sheet, tile: 5 } } }',
      ]),
    ).toEqual([
      'lib.yaml:6:13  error  There is no image "nope" in the assets file. (at components[0].face.image)',
      'lib.yaml:7:26  error  "sheet" has tiles 0 to 5. (at components[0].flippable.back.image)',
      'lib.yaml:8:43  error  "sheet" has 2 rows. (at components[1].face.image)',
      'lib.yaml:9:43  error  "sheet" has 3 columns. (at components[2].face.image)',
    ]);
  });

  it('checks the components a stackable one stacks with', async () => {
    expect(
      await messages([
        '  - { id: card, size: 10, is: piece, stackable: { with: [coin, pawn, nobody, broken] } }',
        '  - { id: coin, size: 10, is: piece, stackable: true }',
        '  - { id: pawn, size: 10, is: piece }',
        '  - { id: broken, size: oops, is: piece }',
      ]),
    ).toEqual([
      'lib.yaml:6:19  error  expected number, received string (at components[3].size)',
      'lib.yaml:3:64  error  "pawn" is not stackable. (at components[0].stackable.with[1])',
      'lib.yaml:3:70  error  There is no component "nobody". (at components[0].stackable.with[2])',
    ]);
  });

  it('wants drop areas to accept components or representations', async () => {
    expect(
      await messages([
        '  - id: board',
        '    size: 100',
        '    is: piece',
        '    container:',
        '      - { id: a, accepts: [card, die, gizmo], area: { at: [0, 0], size: 10 } }',
        '  - { id: card, size: 10, is: piece }',
      ]),
    ).toEqual([
      'lib.yaml:7:39  error  "gizmo" is neither a component nor a representation (piece, zone, die, counter, stamp). (at components[0].container[0].accepts[2])',
    ]);
  });

  it('wants a stamp spot to accept stamps, and keeps stamps out of the inventory', async () => {
    expect(
      await messages(
        [
          '  - id: sheet',
          '    size: 100',
          '    is: piece',
          '    container:',
          '      - { id: a, mode: stamp, accepts: [cross, card, nothing], points: [[5, 5]] }',
          '  - { id: card, size: 10, is: piece }',
          '  - { id: cross, size: 8, is: stamp }',
        ],
        { 'inventory.yaml': 'kind: inventory\ncomponents:\n  - component: cross\n' },
      ),
    ).toEqual([
      'lib.yaml:7:48  error  "card" is a piece, not a stamp. (at components[0].container[0].accepts[1])',
      'lib.yaml:7:54  error  There is no stamp "nothing". (at components[0].container[0].accepts[2])',
      'inventory.yaml:3:5  error  "cross" is a stamp: it is pressed onto sheets, not kept in the box. (at components[0].component)',
    ]);
  });

  it('reports a label without text or field', async () => {
    expect(
      await messages(['  - { id: card, size: 10, is: piece, face: { labels: [{ at: [1, 1] }] } }']),
    ).toEqual([
      'lib.yaml:3:55  error  Give one of "text" or "field". (at components[0].face.labels[0])',
    ]);
  });

  it('finds layer images among the assets or the project files', async () => {
    expect(
      await messages([
        '  - id: card',
        '    size: 10',
        '    is: piece',
        '    fields: { pic: image? }',
        '    face:',
        "      layers: [{ image: art }, { image: art.svg }, { image: '{{pic}}' }, { image: gone.png }]",
        '    flippable: { back: { layers: [{ image: also-gone.png }] } }',
      ]),
    ).toEqual([
      'lib.yaml:8:76  error  "gone.png" is neither an image asset nor a file in the project folder. (at components[0].face.layers[3].image)',
      'lib.yaml:9:37  error  "also-gone.png" is neither an image asset nor a file in the project folder. (at components[0].flippable.back.layers[0].image)',
    ]);
  });

  it('reports a component defined twice', async () => {
    expect(
      await messages([
        '  - { id: card, size: 10, is: piece }',
        '  - { id: card, size: 20, is: die }',
      ]),
    ).toEqual([
      'lib.yaml:4:7  error  "card" is already defined in lib.yaml. (at components[1].id)',
    ]);
  });

  it('reports missing image files and a missing assets file', async () => {
    expect(
      await messages([], { 'assets.yaml': 'kind: assets\nimages: { lost: lost.svg }\n' }),
    ).toEqual([
      'assets.yaml:2:11  error  Image "lost.svg" not found in the project folder. (at images.lost)',
    ]);
    expect(await messages([], { 'trayful.yaml': `${MANIFEST}assets: art/assets.yaml\n` })).toEqual([
      'trayful.yaml:5:1  error  Assets file "art/assets.yaml" not found. (at assets)',
    ]);
  });

  it('loads without assets when there is no assets file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-'));
    await writeFile(path.join(dir, 'trayful.yaml'), MANIFEST);
    await writeFile(path.join(dir, 'lib.yaml'), 'kind: library\ncomponents: []\n');
    await writeFile(path.join(dir, 'inventory.yaml'), 'kind: inventory\ncomponents: []\n');
    const result = await loadProject(dir);
    expect(result.diagnostics).toEqual([]);
    expect(result.project!.assets).toEqual({ images: {}, colors: {} });
  });
});

describe('components that pick their own tile', () => {
  const tiles = [
    '  - id: tile',
    '    size: 10',
    '    is: piece',
    '    stackable: true',
    '    face: { image: { asset: sheet, tile: instance } }',
  ];

  it('give each component a tile, checked against the image', async () => {
    const inventory = [
      'kind: inventory',
      'components:',
      '  - { component: tile, deck: pile, items: [{ tile: 2 }, { tile: 6 }, { tile: -1 }, {}] }',
    ].join('\n');
    const result = await load(tiles, { 'inventory.yaml': inventory });
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      '"tile" must be from 0 to 5.',
      '"tile" must be from 0 to 5.',
    ]);
  });

  it('count the tiles of the smallest image that picks by instance', () => {
    const assets = {
      images: {
        big: { file: 'b', rows: 3, cols: 3 },
        small: { file: 's', rows: 1, cols: 4 },
      },
      colors: {},
    };
    const type: ComponentType = {
      id: 't',
      size: 1,
      is: 'piece',
      face: { image: { asset: 'big', tile: 'instance' } },
      flippable: { back: { image: { asset: 'small', tile: 'instance' } } },
    };
    expect(tileChoices(type, assets)).toBe(4);
    expect(tileChoices({ ...type, flippable: true }, assets)).toBe(9);
    expect(
      tileChoices({ ...type, face: { image: { asset: 'gone', tile: 'instance' } } }, assets),
    ).toBe(4);
    expect(tileChoices({ id: 't', size: 1, is: 'piece' }, assets)).toBeUndefined();
  });
});

it('refuses a deck of components that cannot stack', async () => {
  expect(
    await messages(['  - { id: pawn, size: 10, is: piece }'], {
      'inventory.yaml': 'kind: inventory\ncomponents:\n  - { component: pawn, deck: d }\n',
    }),
  ).toEqual([
    'inventory.yaml:3:24  error  "pawn" is not stackable, so it cannot be in a deck. (at components[0].deck)',
  ]);
});

describe('decks', () => {
  it('hold only components that can share a stack', async () => {
    const components = [
      '  - { id: a, size: 10, is: piece, stackable: true }',
      '  - { id: b, size: 10, is: piece, stackable: true }',
      '  - { id: c, size: 10, is: piece, stackable: { with: [a] } }',
    ];
    const inventory = [
      'kind: inventory',
      'components:',
      '  - { component: a, deck: pile }',
      '  - { component: c, deck: pile }',
      '  - { component: b, deck: pile }',
    ].join('\n');
    const result = await load(components, { 'inventory.yaml': inventory });
    expect(result.diagnostics.map((d) => d.message)).toEqual([
      '"b" and "a" cannot share a stack, so they cannot be in one deck. List one in the other\'s "stackable.with".',
    ]);
  });
});
