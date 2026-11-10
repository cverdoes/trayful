import { GLIDE_MS, type Piece, type Stack, type TableObject, type TableState } from '@trayful/core';
import { TABLE_FORMAT } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { RING_MS, glideFrame, glidesFor, landIn } from '../../src/motion/glides';

const piece = (id: string, extra: Partial<Piece> = {}): Piece => ({
  kind: 'piece',
  id,
  type: 'card',
  pos: [0, 0],
  rot: 0,
  face: 'up',
  z: 1,
  ...extra,
});

const stack = (id: string, items: string[], extra: Partial<Stack> = {}): Stack => ({
  kind: 'stack',
  id,
  pos: [100, 0],
  rot: 0,
  z: 0,
  items,
  ...extra,
});

const state = (...objects: TableObject[]): TableState => ({
  format: TABLE_FORMAT,
  table: 't',
  seed: 1,
  rng: 1,
  objects: Object.fromEntries(objects.map((o) => [o.id, o])),
});

const options = { now: 1000, color: '#d97757' };

describe('glidesFor', () => {
  it('slides a moved piece from where it was and rings it in the mover’s colour', () => {
    const glides = glidesFor(
      {},
      state(piece('a', { pos: [10, 20], rot: 90 })),
      state(piece('a', { pos: [50, 60], rot: 0 })),
      options,
    );
    expect(glides.a).toEqual({
      at: 1000,
      color: '#d97757',
      ring: true,
      from: { pos: [10, 20], rot: 90 },
    });
  });

  it('leaves alone what did not change', () => {
    const table = state(piece('a'), piece('b', { pos: [5, 5] }));
    const moved = state(piece('a'), piece('b', { pos: [9, 9] }));
    expect(Object.keys(glidesFor({}, table, moved, options))).toEqual(['b']);
  });

  it('only rings a piece that changed in place, and turns over a flipped one', () => {
    const glides = glidesFor({}, state(piece('a')), state(piece('a', { face: 'down' })), options);
    expect(glides.a?.from).toBeUndefined();
    expect(glides.a?.flipFrom).toMatchObject({ face: 'up' });
    const counted = glidesFor({}, state(piece('a')), state(piece('a', { value: 3 })), options);
    expect(counted.a).toMatchObject({ ring: true });
    expect(counted.a?.flipFrom).toBeUndefined();
  });

  it('slides a card drawn from a pile out of the pile', () => {
    const before = state(
      stack('deck', ['a', 'b']),
      piece('a', { parent: 'deck' }),
      piece('b', { parent: 'deck' }),
    );
    const after = state(
      stack('deck', ['b']),
      piece('a', { pos: [0, 50] }),
      piece('b', { parent: 'deck' }),
    );
    const glides = glidesFor({}, before, after, options);
    expect(glides.a?.from).toEqual({ pos: [100, 0], rot: 0 });
    expect(glides.deck).toMatchObject({ ring: true });
    expect(glides.b).toBeUndefined();
  });

  it('slides a card out of the pile the server says it came from, when its name changed', () => {
    const before = state(
      stack('deck', ['hidden-1']),
      piece('hidden-1', { parent: 'deck', face: 'down' }),
    );
    const after = state(stack('deck', []), piece('a', { pos: [0, 50] }));
    expect(glidesFor({}, before, after, options).a).toMatchObject({ appear: true });
    const told = glidesFor({}, before, after, { ...options, from: { a: 'deck' } });
    expect(told.a?.from).toEqual({ pos: [100, 0], rot: 0 });
  });

  it('slides a card played into a row from where it lay, without ringing the card itself', () => {
    const before = state(
      stack('row', ['b'], { layout: 'spread' }),
      piece('a', { pos: [0, 50] }),
      piece('b', { parent: 'row' }),
    );
    const after = state(
      stack('row', ['b', 'a'], { layout: 'spread' }),
      piece('a', { parent: 'row' }),
      piece('b', { parent: 'row' }),
    );
    const glides = glidesFor({}, before, after, options);
    expect(glides.a).toMatchObject({ from: { pos: [0, 50], rot: 0 }, ring: false });
    expect(glides.row).toMatchObject({ ring: true });
  });

  it('lets a piece from somewhere hidden appear, and one into a hidden place just go', () => {
    const before = state(piece('a', { hand: 'bea' }), piece('b'));
    const after = state(piece('a', { pos: [5, 5] }), piece('b', { hand: 'bea' }));
    const glides = glidesFor({}, before, after, options);
    expect(glides.a).toMatchObject({ appear: true });
    expect(glides.b).toBeUndefined();
  });

  it('treats a move to another surface as appearing there', () => {
    const glides = glidesFor({}, state(piece('a')), state(piece('a', { surface: 'bea' })), options);
    expect(glides.a).toMatchObject({ appear: true });
  });

  it('only rings when motion is reduced', () => {
    const glides = glidesFor({}, state(piece('a')), state(piece('a', { pos: [9, 9] })), {
      ...options,
      still: true,
    });
    expect(glides.a).toEqual({ at: 1000, color: '#d97757', ring: true });
  });

  it('shows a whole new table without gliding', () => {
    const many = Array.from({ length: 50 }, (_, i) => piece(`p${i}`));
    const moved = many.map((p) => ({ ...p, pos: [1, 1] as [number, number] }));
    expect(glidesFor({}, state(...many), state(...moved), options)).toEqual({});
  });

  it('starts again from where a piece shows now, and forgets glides that are over', () => {
    const first = glidesFor({}, state(piece('a')), state(piece('a', { pos: [100, 0] })), options);
    const halfway = { ...options, now: options.now + GLIDE_MS / 2 };
    const again = glidesFor(
      first,
      state(piece('a', { pos: [100, 0] })),
      state(piece('a', { pos: [100, 100] })),
      halfway,
    );
    expect(again.a?.from?.pos).toEqual([50, 0]);
    const later = { ...options, now: options.now + RING_MS };
    expect(glidesFor(first, state(piece('b')), state(piece('b')), later)).toEqual({});
  });
});

describe('glideFrame', () => {
  const glide = { at: 0, color: 'red', ring: true, from: { pos: [0, 0] as const, rot: 350 } };
  const to = { pos: [100, 0] as const, rot: 10 };

  it('eases from where it was to where it lands, turning the short way round', () => {
    expect(glideFrame(glide, to, 0)).toMatchObject({ pos: [0, 0], rot: 350, ring: 1 });
    const middle = glideFrame(glide, to, GLIDE_MS / 2)!;
    expect(middle.pos[0]).toBeCloseTo(50);
    expect(middle.rot).toBeCloseTo(360);
    expect(glideFrame(glide, to, GLIDE_MS)).toMatchObject({ pos: [100, 0], rot: 370 });
  });

  it('fades the ring after landing, then is over', () => {
    const fading = glideFrame(glide, to, (GLIDE_MS + RING_MS) / 2)!;
    expect(fading.ring).toBeCloseTo(0.5);
    expect(glideFrame(glide, to, RING_MS)).toBeUndefined();
    expect(glideFrame({ ...glide, ring: false }, to, 10)?.ring).toBe(0);
  });

  it('grows and fades in what appears', () => {
    const appearing = { at: 0, color: 'red', ring: true, appear: true };
    expect(glideFrame(appearing, to, 0)).toMatchObject({ scale: 0.7, opacity: 0, pos: [100, 0] });
    expect(glideFrame(appearing, to, GLIDE_MS)).toMatchObject({ scale: 1, opacity: 1 });
  });

  it('shows the old side for the first half of a turn over', () => {
    const was = piece('a');
    const flip = { at: 0, color: 'red', ring: true, flipFrom: was };
    expect(glideFrame(flip, to, GLIDE_MS / 4)?.shows).toBe(was);
    expect(glideFrame(flip, to, GLIDE_MS / 2)?.flipScale).toBeCloseTo(0);
    expect(glideFrame(flip, to, (GLIDE_MS * 3) / 4)?.shows).toBeUndefined();
  });
});

describe('landIn', () => {
  it('says how long until everything has landed', () => {
    expect(landIn({}, 0)).toBe(0);
    expect(landIn({ a: { at: 100, color: 'red', ring: true } }, 200)).toBe(GLIDE_MS - 100);
  });
});
