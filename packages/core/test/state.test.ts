import { describe, expect, it } from 'vitest';
import { removeObject, withChanges, type TableObject } from './state.js';

describe('withChanges', () => {
  it('applies changes and keeps the other keys', () => {
    const object = { id: 'a', x: 1, y: 2 };
    expect(withChanges(object, { x: 5 })).toStrictEqual({ id: 'a', x: 5, y: 2 });
  });

  it('removes a key changed to undefined', () => {
    const object: { id: string; hand?: string } = { id: 'a', hand: 'p1' };
    const changed = withChanges(object, { hand: undefined });
    expect(changed).toStrictEqual({ id: 'a' });
    expect('hand' in changed).toBe(false);
  });

  it('leaves the original object as it was', () => {
    const object = { id: 'a', x: 1 };
    withChanges(object, { x: 5 });
    expect(object).toStrictEqual({ id: 'a', x: 1 });
  });
});

describe('removeObject', () => {
  it('takes only the given id off the record', () => {
    const objects = { a: { id: 'a' }, b: { id: 'b' } } as unknown as Record<string, TableObject>;
    removeObject(objects, 'a');
    expect(Object.keys(objects)).toStrictEqual(['b']);
  });
});
