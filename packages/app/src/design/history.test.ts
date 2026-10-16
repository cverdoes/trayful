import type { ComponentType } from '@trayful/formats/browser';
import { beforeEach, expect, it, vi } from 'vitest';
import { editDraft, openType, redo, setValue, undo, useDesign } from './store';
import { historyKey } from './UndoButtons';

const card: ComponentType = { id: 'card', is: 'piece', size: [63, 88] };

beforeEach(() => {
  // Saving is not what these tests look at; the server always says yes.
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(JSON.stringify({ files: {}, types: {} }))),
  );
  openType(card);
});

it('undoes and redoes each change', () => {
  editDraft((t) => ({ ...t, face: { corner: 1 } }));
  editDraft((t) => ({ ...t, face: { corner: 2 } }));
  undo();
  expect(useDesign.getState().draft?.face?.corner).toBe(1);
  undo();
  expect(useDesign.getState().draft?.face?.corner).toBeUndefined();
  undo();
  redo();
  expect(useDesign.getState().draft?.face?.corner).toBe(1);
  // A new change after an undo drops what could have been redone.
  editDraft((t) => ({ ...t, face: { corner: 5 } }));
  expect(useDesign.getState().future).toEqual([]);
});

it('makes typing one step to undo', () => {
  setValue(['name'])('C');
  setValue(['name'])('Ca');
  setValue(['name'])('Card');
  undo();
  expect(useDesign.getState().draft?.name).toBeUndefined();
});

it('starts over when another type is opened', () => {
  editDraft((t) => ({ ...t, face: { corner: 1 } }));
  openType({ ...card, id: 'other' });
  expect(useDesign.getState()).toMatchObject({ past: [], future: [] });
});

it('reads Ctrl+Z as undo, and Ctrl+Shift+Z or Ctrl+Y as redo', () => {
  const key = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    historyKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
  expect(key('z', { ctrlKey: true })).toBe('undo');
  expect(key('Z', { metaKey: true, shiftKey: true })).toBe('redo');
  expect(key('y', { ctrlKey: true })).toBe('redo');
  expect(key('z')).toBeUndefined();
});
