import type { Piece, TableState } from '@trayful/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { magnifiedPiece, spaceKey, TAP_MS } from './magnify';
import { useStore } from './store';
import { exampleTable } from './testing';

let table: TableState;
const initial = useStore.getState();
const CARD = 'action-card.raid.1';

beforeAll(async () => {
  ({ table } = await exampleTable());
});

beforeEach(() => {
  useStore.setState(
    { ...initial, table: { ...table, hands: {}, bags: {} }, hoveredPiece: CARD },
    true,
  );
});

const shown = () => useStore.getState().magnifier?.piece;

describe('spaceKey', () => {
  it('shows the piece under the pointer while Space is held', () => {
    expect(spaceKey(true, false, 0)).toBe(true);
    expect(shown()).toBe(CARD);
    spaceKey(true, true, 200);
    spaceKey(false, false, TAP_MS + 100);
    expect(shown()).toBeUndefined();
  });

  it('keeps the piece shown after a quick tap, until the next one', () => {
    spaceKey(true, false, 0);
    spaceKey(false, false, TAP_MS - 50);
    expect(shown()).toBe(CARD);
    spaceKey(true, false, 2000);
    expect(shown()).toBeUndefined();
    spaceKey(false, false, 2050);
    expect(shown()).toBeUndefined();
  });

  it('leaves Space alone with nothing under the pointer or a dialog open', () => {
    useStore.setState({ hoveredPiece: undefined });
    expect(spaceKey(true, false, 0)).toBe(false);
    useStore.setState({ hoveredPiece: CARD, helpOpen: true });
    expect(spaceKey(true, false, 0)).toBe(false);
    expect(shown()).toBeUndefined();
  });
});

describe('magnifiedPiece', () => {
  it('shows a piece unturned, with the side up that lies up on the table', () => {
    const card = table.objects[CARD] as Piece;
    const turned = { ...table, objects: { ...table.objects, [CARD]: { ...card, rot: 90 } } };
    expect(magnifiedPiece(turned, CARD)).toMatchObject({ rot: 0, face: card.face });
  });

  it('shows the face of a card in your own hand, which lies face down', () => {
    const card = { ...(table.objects[CARD] as Piece), face: 'down' as const, hand: 'p1' };
    const inHand = { ...table, objects: { ...table.objects, [CARD]: card } };
    expect(magnifiedPiece(inHand, CARD)?.face).toBe('up');
  });

  it('shows nothing for a stack or a piece that is gone', () => {
    const stack = Object.values(table.objects).find((o) => o.kind === 'stack')!;
    expect(magnifiedPiece(table, stack.id)).toBeUndefined();
    expect(magnifiedPiece(table, 'nothing')).toBeUndefined();
  });
});
