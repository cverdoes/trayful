import type { TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { shownNow, useStore } from '../../src/store';
import { loadChoice } from '../../src/table/surfaces';
import { choosePreset, focusNumber, toggleFocus, toggleSurface } from '../../src/table/tiles';
import { isFocusKey } from '../../src/toolbar/keyboard';
import { after, exampleTable, fakeStorage } from '../helpers';

let project: ResolvedProject;
let table: TableState;
const initial = useStore.getState();

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  const split = after(project, table, { type: 'addSurface', id: 'side' });
  useStore.setState({ ...initial, table: { ...split, hands: {}, bags: {} } }, true);
});

afterEach(() => vi.unstubAllGlobals());

describe('picking surfaces', () => {
  it('switches one surface off and keeps the choice for the table', () => {
    toggleSurface('side');
    expect(shownNow(useStore.getState())).toEqual(['centre']);
    expect(loadChoice('/test')).toEqual({ hidden: ['side'] });
    choosePreset('all');
    expect(shownNow(useStore.getState())).toEqual(['centre', 'side']);
  });

  it('focuses one tile and goes back, by number or by surface', () => {
    toggleFocus('side');
    expect(shownNow(useStore.getState())).toEqual(['side']);
    expect(focusNumber(1)).toBe(true);
    expect(shownNow(useStore.getState())).toEqual(['centre']);
    expect(focusNumber(1)).toBe(true);
    expect(shownNow(useStore.getState())).toEqual(['centre', 'side']);
    expect(focusNumber(3)).toBe(false);
  });

  it('leaves a focus when picking a view', () => {
    toggleFocus('side');
    choosePreset('centre');
    expect(useStore.getState().focus).toBeUndefined();
    expect(shownNow(useStore.getState())).toEqual(['centre']);
  });

  it('has nothing to focus on a table without surfaces', () => {
    useStore.setState({ table: { ...table, hands: {}, bags: {} } });
    expect(focusNumber(1)).toBe(false);
  });
});

describe('isFocusKey', () => {
  const press = (key: string, ctrlKey = false) =>
    isFocusKey({ key, ctrlKey, metaKey: false, altKey: false, shiftKey: false });
  it('takes the number keys 1 to 9 on their own', () => {
    expect(press('1')).toBe(true);
    expect(press('9')).toBe(true);
    expect(press('0')).toBe(false);
    expect(press('1', true)).toBe(false);
  });
});
