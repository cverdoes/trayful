// The upgrade must not change how anything looks. These tests draw each old type the
// way the first format's renderer did, and compare that with drawingOf on the upgraded
// component.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { assetsOf } from './component.js';
import { drawingOf, isShown, resolveColor, type Drawing, type Shown } from './drawing.js';
import { renderTemplate } from './fields.js';
import { loadProject } from './load.js';
import { LegacyLibraryFile, type Layer, type LegacyComponentType, type Scalar } from './schemas.js';
import { AssetCollector, typesByBase, upgradeType } from './upgrade.js';

type Data = Record<string, Scalar | undefined>;
type OldDrawing = Pick<Drawing, 'outline' | 'corner' | 'fill' | 'stroke' | 'plainBack'> & {
  layers: unknown[];
};

const TWO_SIDED = new Set(['card', 'tile', 'token']);

/** How the first format's renderer drew one side of a type. */
function oldDrawing(
  type: LegacyComponentType,
  down: boolean,
  data: Data,
  palette: Record<string, string>,
): OldDrawing {
  const back = TWO_SIDED.has(type.base) && down;
  const face = back ? type.back : type.front;
  const color = (value: string | undefined) => resolveColor(value, data, palette);
  return {
    outline: type.shape ?? (type.base === 'meeple' ? 'meeple' : 'rect'),
    corner: type.corner ?? (type.base === 'die' ? 2 : 0),
    fill: oldFill(type, back, color),
    stroke: color(face?.stroke) ?? '#5c5346',
    plainBack: back && !type.back,
    layers: (face?.layers ?? []).flatMap((layer) => oldLayer(layer, data, color)),
  };
}

function oldFill(
  type: LegacyComponentType,
  back: boolean,
  color: (value: string | undefined) => string | undefined,
): string {
  const face = back ? type.back : type.front;
  const own = color(face?.fill);
  if (own !== undefined) return own;
  if (back && !type.back) return '#3b4252';
  const typeFill = back ? undefined : color(type.fill);
  if (typeFill !== undefined) return typeFill;
  if (type.base === 'zone') return 'transparent';
  return back ? '#3b4252' : '#f4f1ea';
}

/** One old layer, in the terms of a drawing layer, or nothing when it was not drawn. */
function oldLayer(
  layer: Layer,
  data: Data,
  color: (value: string | undefined) => string | undefined,
): unknown[] {
  if (!isShown(layer.when, data)) return [];
  const common = { at: layer.at ?? [0, 0], rotate: layer.rotate ?? 0, opacity: layer.opacity ?? 1 };
  if ('text' in layer) {
    const text = renderTemplate(layer.text, data);
    if (!text) return [];
    const { width, font } = layer;
    const align = layer.align ?? 'left';
    const valign = layer.valign ?? 'top';
    return [
      {
        kind: 'text',
        ...common,
        text,
        width,
        align,
        valign,
        font,
        color: color(layer.color) ?? '#111',
      },
    ];
  }
  if ('image' in layer) {
    const file = renderTemplate(layer.image, data).trim();
    return file
      ? [{ kind: 'image', ...common, file, size: layer.size, fit: layer.fit ?? 'cover' }]
      : [];
  }
  const stroke = color(layer.stroke);
  const { shape, size, r, strokeWidth } = layer;
  return [
    {
      kind: 'shape',
      ...common,
      shape,
      size,
      r,
      fill: color(layer.fill),
      stroke,
      strokeWidth: strokeWidth ?? (stroke ? 0.3 : 0),
    },
  ];
}

/** Leaves out keys that hold nothing, as both drawings do in different places. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

function newDrawing(...args: Parameters<typeof drawingOf>): OldDrawing {
  const { outline, corner, fill, stroke, plainBack, layers } = drawingOf(...args);
  return { outline, corner, fill, stroke, plainBack, layers };
}

/** Upgrades old types and checks each side looks the same for each set of data. */
function expectSameLook(
  types: LegacyComponentType[],
  palette: Record<string, string>,
  dataOf: (id: string) => Data[],
) {
  const collector = new AssetCollector();
  collector.palette(palette);
  const bases = typesByBase(types);
  const upgraded = types.map((type) => upgradeType(type, collector, bases));
  const assets = assetsOf(collector.file());
  for (const [i, type] of types.entries()) {
    for (const data of dataOf(type.id)) {
      for (const face of ['up', 'down'] as const) {
        const shown: Shown = { face, data };
        expect(plain(newDrawing(upgraded[i]!, shown, assets)), `${type.id} ${face}`).toEqual(
          plain(oldDrawing(type, face === 'down', data, palette)),
        );
      }
    }
  }
}

const fixture = fileURLToPath(new URL('../fixtures/legacy-harvest-moon', import.meta.url));

async function readLegacyLibrary(file: string) {
  return LegacyLibraryFile.parse(parse(await readFile(`${fixture}/${file}`, 'utf8')));
}

describe('upgraded components look as they did', () => {
  it('for every type of the old Harvest Moon, with each component’s data', async () => {
    const libraries = [
      await readLegacyLibrary('library/cards.yaml'),
      await readLegacyLibrary('library/pieces.yaml'),
    ];
    const types = libraries.flatMap((l) => l.types);
    const palette = Object.assign({}, ...libraries.map((l) => l.palette));
    const { components } = (await loadProject(fixture)).project!;
    expect(types).toHaveLength(6);
    expectSameLook(types, palette, (id) => [
      {},
      ...components.filter((c) => c.type === id).map((c) => c.data),
    ]);
  });

  it('for each old base, shape and kind of face', () => {
    const at: [number, number] = [2, 3];
    const types: LegacyComponentType[] = [
      { id: 'zone', base: 'zone', size: 50, snap: [{ id: 'a', area: { at, size: 5 } }] },
      { id: 'filled-zone', base: 'zone', size: 50, fill: 'paper' },
      { id: 'pawn', base: 'meeple', size: 16, fill: '{{colour}}' },
      { id: 'cube', base: 'meeple', size: 8, shape: 'cube', corner: 1 },
      { id: 'die', base: 'die', size: 16, faces: ['a', 'b'], front: { stroke: 'ink' } },
      { id: 'counter', base: 'counter', size: 20, range: [1, 9], corner: 4 },
      {
        id: 'tile',
        base: 'tile',
        size: 40,
        shape: 'hex',
        fill: 'paper',
        front: {
          layers: [
            { text: '{{name}}', at, color: 'ink' },
            { text: 'Fixed', align: 'right' },
          ],
        },
        back: { layers: [{ image: 'art/back.svg' }, { text: 'Back', valign: 'bottom' }] },
      },
      {
        id: 'token',
        base: 'token',
        size: 20,
        shape: 'circle',
        front: {
          fill: 'ink',
          layers: [
            { image: '{{art}}', when: '{{art}}' },
            { shape: 'hex', r: 3, stroke: 'paper' },
            { image: 'art/icon.svg', at, size: 4, fit: 'contain', opacity: 0.5, rotate: 30 },
          ],
        },
        back: { stroke: '{{colour}}' },
      },
      { id: 'card', base: 'card', size: [63, 88], fill: '{{colour}}' },
      { id: 'board', base: 'board', size: 300, front: { layers: [{ image: 'art/board.png' }] } },
    ];
    const palette = { ink: '#222', paper: '#fffbe8', red: '#c00' };
    expectSameLook(types, palette, () => [
      {},
      { colour: 'red', name: 'Ann', art: 'art/a.png' },
      { colour: '#00f', name: '', art: '' },
    ]);
  });
});
