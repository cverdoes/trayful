import { describe, expect, it } from 'vitest';
import type { LegacyComponentType, SetupFile } from './schemas.js';
import {
  AssetCollector,
  typesByBase,
  upgradeEntry,
  upgradeManifest,
  upgradeSetup,
  upgradeType,
} from './upgrade.js';

type Legacy = Partial<LegacyComponentType> & Pick<LegacyComponentType, 'base'>;

function upgrade(type: Legacy, bases: Record<string, string[]> = {}) {
  const assets = new AssetCollector();
  const component = upgradeType({ id: 't', size: 10, ...type }, assets, bases);
  return { component, assets: assets.file() };
}

describe('upgradeType', () => {
  it('makes a card a flippable, turning, stackable piece', () => {
    expect(upgrade({ base: 'card', name: 'Card', description: 'A card' }).component).toEqual({
      id: 't',
      name: 'Card',
      description: 'A card',
      size: 10,
      is: 'piece',
      flippable: true,
      rotates: true,
      stackable: true,
    });
  });

  it('lets old cards stack with the other cards, as the table let them', () => {
    const bases = { card: ['t', 'event'], token: ['coin'] };
    expect(upgrade({ base: 'card' }, bases).component.stackable).toEqual({ with: ['event'] });
  });

  it('drops a primitive from `accepts` when the project has none of it, as nothing matched it', () => {
    const snap = [{ id: 'spot', points: [[0, 0] as [number, number]], accepts: ['meeple', 'd6'] }];
    expect(upgrade({ base: 'board', snap }).component.container).toEqual([
      { id: 'spot', points: [[0, 0]], accepts: ['d6'] },
    ]);
  });

  it('makes tiles and tokens flippable and stackable like cards', () => {
    for (const base of ['tile', 'token'] as const) {
      expect(upgrade({ base }).component).toMatchObject({
        is: 'piece',
        flippable: true,
        stackable: true,
      });
    }
  });

  it('makes a board a piece that turns but neither flips nor stacks', () => {
    expect(upgrade({ base: 'board', rotationStep: 45 }).component).toEqual({
      id: 't',
      size: 10,
      is: 'piece',
      rotates: { step: 45 },
    });
  });

  it('makes a meeple a piece with a meeple outline, unless it had its own shape', () => {
    expect(upgrade({ base: 'meeple' }).component).toEqual({
      id: 't',
      size: 10,
      is: 'piece',
      rotates: true,
      face: { shape: 'meeple' },
    });
    expect(upgrade({ base: 'meeple', shape: 'cube' }).component.face).toEqual({ shape: 'cube' });
  });

  it('keeps a zone a zone, its snap targets becoming drop areas', () => {
    const snap = [
      { id: 'hand', area: { at: [0, 0] as [number, number], size: 5 }, accepts: ['card', 'd6'] },
      { id: 'any', points: [[0, 0] as [number, number]] },
    ];
    expect(upgrade({ base: 'zone', snap }, { card: ['action', 'event'] }).component).toEqual({
      id: 't',
      size: 10,
      is: 'zone',
      rotates: true,
      container: [
        { id: 'hand', area: { at: [0, 0], size: 5 }, accepts: ['action', 'event', 'd6'] },
        { id: 'any', points: [[0, 0]] },
      ],
    });
  });

  it('gives a die rounded corners and writes only faces that are not 1 to 6', () => {
    expect(upgrade({ base: 'die' }).component).toEqual({
      id: 't',
      size: 10,
      is: 'die',
      face: { corner: 2 },
    });
    expect(upgrade({ base: 'die', faces: [1, 2, 3, 4, 5, 6], corner: 0 }).component).toEqual({
      id: 't',
      size: 10,
      is: 'die',
    });
    expect(upgrade({ base: 'die', faces: [0, 1, 2] }).component.values).toEqual({ range: [0, 2] });
    expect(upgrade({ base: 'die', faces: [1, 3, 5] }).component.values).toEqual({
      list: [1, 3, 5],
    });
    expect(upgrade({ base: 'die', faces: ['sun', 'moon'] }).component.values).toEqual({
      list: ['sun', 'moon'],
    });
  });

  it('writes a counter range only when it is not 0 to 99', () => {
    expect(upgrade({ base: 'counter', range: [0, 99] }).component).toEqual({
      id: 't',
      size: 10,
      is: 'counter',
    });
    expect(upgrade({ base: 'counter', range: [1, 20] }).component.values).toEqual({
      range: [1, 20],
    });
  });

  it('moves shape, corner and fill into the face, leaving out a plain rect', () => {
    expect(
      upgrade({ base: 'token', shape: 'rect', corner: 1, fill: 'red', fields: { n: 'int' } })
        .component,
    ).toMatchObject({ fields: { n: 'int' }, face: { corner: 1, fill: 'red' } });
  });

  it('makes a plain first image the face image, an asset named after its file', () => {
    const { component, assets } = upgrade({
      base: 'card',
      front: { layers: [{ image: 'art/Big Sun.svg', fit: 'cover' }] },
      back: { stroke: 'ink', layers: [{ image: 'art/back.svg' }] },
    });
    expect(component.face).toEqual({ image: 'big-sun' });
    expect(component.flippable).toEqual({ back: { stroke: 'ink', image: 'back' } });
    expect(assets).toEqual({
      kind: 'assets',
      images: { 'big-sun': 'art/Big Sun.svg', back: 'art/back.svg' },
    });
  });

  it('turns text into labels when only text is left, a lone field becoming `field`', () => {
    const { component } = upgrade({
      base: 'card',
      fields: { name: 'string' },
      front: {
        layers: [
          { image: 'a.png' },
          { text: '{{ name }}', at: [1, 2] },
          { text: 'Cost {{cost}}', align: 'center' },
        ],
      },
    });
    expect(component.face).toEqual({
      image: 'a',
      labels: [
        { field: 'name', at: [1, 2] },
        { text: 'Cost {{cost}}', align: 'center' },
      ],
    });
  });

  it('keeps mixed layers, and images that do more than cover the face, as layers', () => {
    const layers = [
      { image: 'a.png', at: [1, 1] as [number, number] },
      { image: '{{art}}' },
      { text: 'x' },
      { shape: 'circle' as const, r: 2 },
    ];
    expect(upgrade({ base: 'card', front: { layers } }).component.face).toEqual({
      layers: [{ image: 'a', at: [1, 1] }, { image: '{{art}}' }, { text: 'x' }, layers[3]],
    });
    expect(
      upgrade({ base: 'card', front: { layers: [{ image: 'a.png', fit: 'contain' }] } }).component
        .face,
    ).toEqual({ layers: [{ image: 'a', fit: 'contain' }] });
  });
});

describe('AssetCollector', () => {
  it('names each file once, numbering names that clash, and keeps the palette', () => {
    const assets = new AssetCollector();
    expect(assets.file()).toBeUndefined();
    expect(assets.image('a/sun.svg')).toBe('sun');
    expect(assets.image('b/sun.png')).toBe('sun-2');
    expect(assets.image('a/sun.svg')).toBe('sun');
    expect(assets.image('!!.png')).toBe('image');
    assets.palette({ red: '#f00' });
    assets.palette(undefined);
    expect(assets.file()).toEqual({
      kind: 'assets',
      images: { sun: 'a/sun.svg', 'sun-2': 'b/sun.png', image: '!!.png' },
      colors: { red: '#f00' },
    });
  });

  it('writes only colours when there are no images', () => {
    const assets = new AssetCollector();
    assets.palette({ red: '#f00' });
    expect(assets.file()).toEqual({ kind: 'assets', colors: { red: '#f00' } });
  });
});

describe('the rest of a project', () => {
  it('groups old type ids by their base', () => {
    expect(
      typesByBase([
        { id: 'a', base: 'card', size: 1 },
        { id: 'b', base: 'card', size: 1 },
        { id: 'c', base: 'die', size: 1 },
      ]),
    ).toEqual({ card: ['a', 'b'], die: ['c'] });
  });

  it('moves the manifest to the new format, naming the assets file', () => {
    const old = {
      name: 'Game',
      format: 'trayful/1' as const,
      libraries: ['lib.yaml'],
      inventory: 'inventory.yaml',
    };
    expect(upgradeManifest(old, undefined)).toEqual({
      name: 'Game',
      format: 'trayful/2',
      libraries: ['lib.yaml'],
      inventory: 'inventory.yaml',
    });
    expect(
      upgradeManifest(
        { ...old, version: '1', description: 'd', units: 'mm', setups: ['s/*.yaml'], setup: 's' },
        'assets.yaml',
      ),
    ).toEqual({
      name: 'Game',
      format: 'trayful/2',
      version: '1',
      description: 'd',
      units: 'mm',
      assets: 'assets.yaml',
      libraries: ['lib.yaml'],
      inventory: 'inventory.yaml',
      setups: ['s/*.yaml'],
      setup: 's',
    });
  });

  it('names an inventory entry’s component with `component`', () => {
    expect(upgradeEntry({ type: 'card', count: 2, deck: 'main' })).toEqual({
      component: 'card',
      count: 2,
      deck: 'main',
    });
  });

  it('locks boards placed by a setup, as they were locked before', () => {
    const setup: SetupFile = {
      kind: 'setup',
      steps: [
        { place: 'board', at: [0, 0] },
        { place: 'board.big', at: [0, 0] },
        { place: 'board~2', at: [0, 0] },
        { place: 'board', at: [0, 0], lock: false },
        { place: 'card', at: [0, 0] },
        { place: { deck: 'board' }, at: [0, 0] },
        { shuffle: 'main' },
      ],
    };
    expect(upgradeSetup(setup, new Set(['board'])).steps).toEqual([
      { place: 'board', at: [0, 0], lock: true },
      { place: 'board.big', at: [0, 0], lock: true },
      { place: 'board~2', at: [0, 0], lock: true },
      { place: 'board', at: [0, 0], lock: false },
      { place: 'card', at: [0, 0] },
      { place: { deck: 'board' }, at: [0, 0] },
      { shuffle: 'main' },
    ]);
  });
});
