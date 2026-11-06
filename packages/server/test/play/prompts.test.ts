import { describe, expect, it } from 'vitest';
import { EventFeed } from '../../src/play/feed.js';
import { PromptBoard } from '../../src/play/prompts.js';

const vote = {
  kind: 'choice' as const,
  text: 'Who goes first?',
  options: [
    { id: 'ann', label: 'Ann' },
    { id: 'bo', label: 'Bo' },
  ],
};

function board() {
  const feed = new EventFeed();
  const changed: string[][] = [];
  return { feed, changed, prompts: new PromptBoard(feed, (p) => changed.push([...p])) };
}

describe('the prompt board', () => {
  it('waits for every player it asked, then closes', () => {
    const { feed, changed, prompts } = board();
    const { prompt } = prompts.ask(vote, ['ann', 'bo'], 'Claude');
    expect(prompt.from).toBe('Claude');
    expect(prompts.waitingFor('ann')).toEqual([prompt]);
    expect(changed).toEqual([['ann', 'bo']]);

    prompts.answer('ann', prompt.id, ['bo']);
    expect(prompts.waitingFor('ann')).toEqual([]);
    expect(prompts.waitingFor('bo')).toEqual([prompt]);
    expect(prompts.status(prompt.id).open).toBe(true);

    prompts.answer('bo', prompt.id, ['bo']);
    const status = prompts.status(prompt.id);
    expect(status).toMatchObject({ open: false, answers: { ann: ['bo'], bo: ['bo'] } });
    expect(feed.since(0).events.map((e) => e.kind)).toEqual([
      'answered',
      'answered',
      'prompt-closed',
    ]);
  });

  it('refuses answers from players it did not ask, twice, or that do not fit', () => {
    const { prompts } = board();
    const { prompt } = prompts.ask(vote, ['ann', 'bo'], 'Claude');
    expect(() => prompts.answer('cy', prompt.id, ['ann'])).toThrow('no longer waiting');
    expect(() => prompts.answer('ann', prompt.id, ['zed'])).toThrow('not one of the options');
    prompts.answer('ann', prompt.id, ['ann']);
    expect(() => prompts.answer('ann', prompt.id, ['bo'])).toThrow('no longer waiting');
  });

  it('takes a withdrawn prompt away from everyone', () => {
    const { feed, prompts } = board();
    const { prompt } = prompts.ask({ kind: 'confirm', text: 'Ready?' }, ['ann'], 'Claude');
    expect(prompts.cancel(prompt.id).open).toBe(false);
    expect(prompts.waitingFor('ann')).toEqual([]);
    expect(feed.since(0).events).toMatchObject([{ kind: 'prompt-closed', reason: 'cancelled' }]);
    expect(() => prompts.answer('ann', prompt.id, true)).toThrow('no longer waiting');
    expect(() => prompts.cancel('nope')).toThrow('There is no prompt "nope"');
  });

  it('lists open prompts before closed ones', () => {
    const { prompts } = board();
    const first = prompts.ask({ kind: 'message', text: 'Hello' }, ['ann'], 'Claude').prompt;
    const second = prompts.ask({ kind: 'message', text: 'Again' }, ['ann'], 'Claude').prompt;
    prompts.answer('ann', first.id, true);
    expect(prompts.list().map((s) => s.prompt.id)).toEqual([second.id, first.id]);
  });

  it('needs someone to ask', () => {
    expect(() => board().prompts.ask(vote, [], 'Claude')).toThrow('which players');
  });
});

describe('the event feed', () => {
  it('numbers events and hands out those after a reader left off', () => {
    const feed = new EventFeed();
    expect(feed.since()).toEqual({ events: [], next: 0 });
    feed.push({ kind: 'joined', player: 'ann' });
    feed.push({ kind: 'left', player: 'ann' });
    const page = feed.since(1);
    expect(page.next).toBe(2);
    expect(page.events).toMatchObject([{ seq: 2, kind: 'left' }]);
    expect(page.missed).toBeUndefined();
  });

  it('says when a reader fell so far behind that events were dropped', () => {
    const feed = new EventFeed();
    for (let i = 0; i < 510; i++) feed.push({ kind: 'joined', player: 'ann' });
    const page = feed.since(3);
    expect(page.missed).toBe(true);
    expect(page.events).toHaveLength(500);
  });

  it('wakes a waiting reader as soon as something happens', async () => {
    const feed = new EventFeed();
    const waiting = feed.wait(0, 5000);
    feed.push({ kind: 'joined', player: 'bo' });
    expect((await waiting).events).toMatchObject([{ kind: 'joined', player: 'bo' }]);
  });

  it('gives up after the time allowed, and lets readers go when it closes', async () => {
    const feed = new EventFeed();
    expect(await feed.wait(undefined, 10)).toEqual({ events: [], next: 0 });
    const waiting = feed.wait(0, 60_000);
    feed.close();
    expect((await waiting).events).toEqual([]);
  });
});
