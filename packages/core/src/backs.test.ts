import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { describeTable, summarizePiece } from './describe.js';
import { AliasBook, viewFor } from './privacy.js';
import { createTable } from './setup.js';
import type { Piece, TableState } from './state.js';

// The piecepack's coins show their suit on the back; its tiles show no field there.
const example = fileURLToPath(new URL('../../../examples/piecepack', import.meta.url));

let project: ResolvedProject;
let state: TableState;
beforeAll(async () => {
  project = (await loadProject(example)).project!;
  state = createTable(project, { name: 'test', seed: 42 });
});

const pieces = (type: string) =>
  Object.values(state.objects).filter((o): o is Piece => o.kind === 'piece' && o.type === type);
let counter = 0;
const book = () => new AliasBook(() => String(++counter));

describe('face-down pieces', () => {
  it('keep the fields their back shows, and only those', () => {
    const view = viewFor(state, undefined, book(), project.types);
    const coins = Object.values(view.objects).filter(
      (o): o is Piece => o.kind === 'piece' && o.type === 'coin',
    );
    expect(coins.every((coin) => coin.face === 'down' && coin.id.startsWith('hidden-'))).toBe(true);
    const tops = Object.values(view.objects).flatMap((o) =>
      o.kind === 'stack' ? [view.objects[o.items.at(-1)!] as Piece] : [],
    );
    const coinTops = tops.filter((p) => p.type === 'coin');
    expect(coinTops.length).toBeGreaterThan(0);
    for (const top of coinTops) {
      expect(Object.keys(top.data ?? {}).sort()).toEqual(['suit', 'symbol']);
    }
  });

  it('under the top of a pile show nothing, since their backs are covered', () => {
    const view = viewFor(state, undefined, book(), project.types);
    const buried = Object.values(view.objects).flatMap((o) =>
      o.kind === 'stack' ? o.items.slice(0, -1) : [],
    );
    expect(buried.length).toBeGreaterThan(0);
    for (const id of buried) expect((view.objects[id] as Piece).data).toBeUndefined();
  });

  it('lose all their data when the back shows none', () => {
    const view = viewFor(state, undefined, book(), project.types);
    const tiles = Object.values(view.objects).filter(
      (o): o is Piece => o.kind === 'piece' && o.type === 'tile' && o.face === 'down',
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) expect(tile.data).toBeUndefined();
  });

  it('are described to agents by what their back shows', () => {
    const coin = pieces('coin')[0]!;
    expect(summarizePiece(coin, project.types).data).toEqual({
      suit: coin.data!.suit,
      symbol: coin.data!.symbol,
    });
    expect(summarizePiece(coin, project.types, true).data).toEqual(coin.data);
    expect(describeTable(state, project.types)).toMatch(/top face down \{suit: \w+; symbol:/);
  });
});
