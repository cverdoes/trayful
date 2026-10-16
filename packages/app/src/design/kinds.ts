import type { ComponentType } from '@trayful/formats/browser';

/** What each kind of component is called, and what it is for, in a sentence. */
export const KIND_TEXT: Record<ComponentType['is'], { name: string; about: string }> = {
  piece: { name: 'Piece', about: 'Cards, tiles, tokens, boards: anything moved around.' },
  zone: { name: 'Zone', about: 'An area of the table that holds what is put on it.' },
  die: { name: 'Die', about: 'Rolls to one of its values.' },
  counter: { name: 'Counter', about: 'Keeps a number, stepped up and down.' },
};
