import type { ClientMessage, PlayerPrompt } from '@trayful/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../src/store';
import { asksFor, clickForPrompt, promptMarks } from '../../src/table/promptTargets';

const initial = useStore.getState();
let sent: ClientMessage[];

const pick = (extra: Partial<PlayerPrompt> = {}): PlayerPrompt => ({
  id: 'p1',
  from: 'Claude',
  kind: 'pick',
  text: 'Pick',
  candidates: ['a', 'b', 'c'],
  ...extra,
});

function show(...prompts: PlayerPrompt[]) {
  useStore.getState().receive({ type: 'prompts', prompts });
}

beforeEach(() => {
  sent = [];
  useStore.setState({ ...initial, send: (m) => sent.push(m) }, true);
});

describe('prompt targets', () => {
  it('lights up candidates, the anchor and highlights', () => {
    expect(promptMarks(undefined).size).toBe(0);
    const marks = promptMarks(pick({ anchor: 'board', highlight: ['d'] }));
    expect([...marks]).toEqual(['a', 'b', 'c', 'board', 'd']);
    expect(asksFor(pick(), 'pick')).toBe(true);
    expect(asksFor(pick(), 'place')).toBe(false);
  });

  it('answers at once when the prompt wants exactly one', () => {
    show(pick());
    expect(clickForPrompt('b', 'pick')).toBe(true);
    expect(sent).toEqual([{ type: 'answer', prompt: 'p1', answer: ['b'] }]);
  });

  it('leaves clicks alone that are not for the prompt', () => {
    expect(clickForPrompt('a', 'pick')).toBe(false);
    show(pick());
    expect(clickForPrompt('zed', 'pick')).toBe(false);
    expect(clickForPrompt('a', 'place')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('gathers picks up to the most allowed, and takes them back', () => {
    show(pick({ min: 1, max: 2 }));
    clickForPrompt('a', 'pick');
    clickForPrompt('b', 'pick');
    clickForPrompt('c', 'pick');
    expect(useStore.getState().picked).toEqual(['a', 'b']);
    clickForPrompt('a', 'pick');
    expect(useStore.getState().picked).toEqual(['b']);
    expect(sent).toEqual([]);
  });

  it('starts over when another prompt comes first', () => {
    show(pick({ min: 1, max: 2 }));
    clickForPrompt('a', 'pick');
    show(pick({ min: 1, max: 2 }), pick({ id: 'p2' }));
    expect(useStore.getState().picked).toEqual(['a']);
    show(pick({ id: 'p2' }));
    expect(useStore.getState().picked).toEqual([]);
  });
});
