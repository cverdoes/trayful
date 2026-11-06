import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ServerMessage } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../../src/mcp/server.js';
import { MemoryPlayerStore } from '../../src/play/players.js';
import type { TableSession } from '../../src/play/session.js';
import { Workspace } from '../../src/projects/workspace.js';
import { examplePath } from '../paths.js';

interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

describe('MCP prompt tools', () => {
  let workspace: Workspace;
  let session: TableSession;
  let client: Client;
  let ann: string;
  /** What Ann's browser has been sent. */
  let seen: ServerMessage[];

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    const text = result.content[0]?.text ?? '';
    return {
      isError: result.isError,
      text,
      json: () => JSON.parse(text) as Record<string, unknown>,
    };
  };
  const lastPrompts = () => seen.findLast((m) => m.type === 'prompts');
  const handOf = (player: string) =>
    Object.values(session.engine.state.objects)
      .filter((o) => o.kind === 'piece' && o.hand === player)
      .map((o) => o.id);

  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-prompts-'));
    await cp(examplePath('harvest-moon'), dir, {
      recursive: true,
      filter: (src) => path.basename(src) !== 'tables',
    });
    workspace = await Workspace.open(dir, {
      seed: 3,
      setup: false,
      watch: false,
      playerStore: new MemoryPlayerStore(),
    });
    session = workspace.active;
    ann = (await workspace.players.join('Ann', 'guest')).player.id;
    seen = [];
    session.subscribe((m) => seen.push(m), ann);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => workspace.close());

  it('lists the players at the table in describe_table', async () => {
    expect((await call('describe_table')).text).toContain(`- ${ann}: Ann (guest, here now)`);
  });

  it('asks a player, who answers in the browser, and the agent hears it', async () => {
    const start = (await call('wait_for_events', { seconds: 0 })).json().next as number;
    const asked = await call('prompt', {
      to: [ann],
      kind: 'choice',
      title: 'Your turn',
      text: 'Take what?',
      options: [
        { id: 'coins', label: '2 coins' },
        { id: 'card', label: '1 card' },
      ],
    });
    const { id } = asked.json() as { id: string };
    expect(asked.json()).toMatchObject({ open: true, waitingFor: [ann] });
    expect(lastPrompts()).toMatchObject({
      prompts: [{ id, from: 'Claude', title: 'Your turn', kind: 'choice' }],
    });

    expect(session.handle({ type: 'answer', prompt: id, answer: ['card'] }, ann)).toBeUndefined();
    expect(lastPrompts()).toEqual({ type: 'prompts', prompts: [] });

    const page = (await call('wait_for_events', { since: start, seconds: 1 })).json();
    expect(page.events).toMatchObject([
      { kind: 'answered', prompt: id, player: ann, answer: ['card'] },
      { kind: 'prompt-closed', prompt: id, reason: 'answered' },
    ]);
    expect((await call('list_prompts')).json()).toMatchObject([{ id, open: false }]);
  });

  it('waits for the answer when asked to', async () => {
    const asking = call('prompt', { to: [ann], kind: 'confirm', text: 'Ready?', wait: 5 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const [prompt] = session.prompts.waitingFor(ann);
    session.handle({ type: 'answer', prompt: prompt!.id, answer: true }, ann);
    expect((await asking).json()).toMatchObject({ open: false, answers: { [ann]: true } });
  });

  it('tells the browser off for an answer that does not fit', async () => {
    const { id } = (await call('prompt', { to: [ann], kind: 'message', text: 'Hi' })).json();
    expect(session.handle({ type: 'answer', prompt: id as string, answer: false }, ann)).toEqual({
      type: 'error',
      message: 'A message is answered with true.',
    });
  });

  it('withdraws a prompt', async () => {
    const { id } = (await call('prompt', { to: [ann], kind: 'message', text: 'Hi' })).json();
    expect((await call('cancel_prompt', { id })).json()).toMatchObject({ open: false });
    expect(lastPrompts()).toEqual({ type: 'prompts', prompts: [] });
    expect((await call('cancel_prompt', { id: 'nope' })).isError).toBe(true);
  });

  it('refuses players who are not at the table, and prompts that cannot be shown', async () => {
    const nobody = await call('prompt', { to: ['zed'], kind: 'message', text: 'Hi' });
    expect(nobody).toMatchObject({
      isError: true,
      text: 'There is no player "zed" at this table.',
    });
    const lonely = await call('prompt', {
      to: [ann],
      kind: 'choice',
      text: 'Pick',
      options: [{ id: 'a', label: 'A' }],
    });
    expect(lonely).toMatchObject({ isError: true, text: 'A choice needs at least two options.' });
  });

  it('reports moves and who came and went', async () => {
    const { next } = (await call('wait_for_events', { seconds: 0 })).json();
    await call('roll', { ids: ['d6.1'] });
    const unsubscribe = session.subscribe(() => undefined, 'bo');
    unsubscribe();
    const page = (await call('wait_for_events', { since: next, seconds: 0 })).json();
    expect(page.events).toMatchObject([
      { kind: 'changed', change: 'apply', player: 'claude', text: 'rolled 1 die' },
      { kind: 'joined', player: 'bo' },
      { kind: 'left', player: 'bo' },
    ]);
  });

  it('shows a face-down candidate by its stand-in id and hears the real one back', async () => {
    await call('draw', { from: 'deck:actions', to: [100, 400] });
    const card = Object.values(session.engine.state.objects).find(
      (o) => o.kind === 'piece' && o.face === 'down' && o.pos[0] === 100,
    )!;
    const { id } = (
      await call('prompt', {
        to: [ann],
        kind: 'pick',
        text: 'Pick the card you drew',
        candidates: [card.id, 'worker.red.1'],
      })
    ).json();
    const shown = lastPrompts() as { prompts: { candidates: string[] }[] };
    const standIn = shown.prompts[0]!.candidates[0]!;
    expect(standIn).not.toBe(card.id);
    expect(standIn.startsWith('hidden-')).toBe(true);
    expect(shown.prompts[0]!.candidates[1]).toBe('worker.red.1');

    session.handle({ type: 'answer', prompt: id as string, answer: [standIn] }, ann);
    expect(session.prompts.status(id as string).answers[ann]).toEqual([card.id]);
  });

  it('refuses to name pieces a player cannot see, and places that do not exist', async () => {
    await call('draw', { from: 'deck:actions', to: 'hand:claude' });
    const [mine] = handOf('claude');
    const hidden = await call('prompt', {
      to: [ann],
      kind: 'pick',
      text: 'Pick',
      candidates: [mine!],
    });
    expect(hidden).toMatchObject({ isError: true });
    expect(hidden.text).toContain("in another player's hand");
    const nowhere = await call('prompt', {
      to: [ann],
      kind: 'place',
      text: 'Where?',
      candidates: ['worker.red.1/nowhere'],
    });
    expect(nowhere.isError).toBe(true);
    const missing = await call('prompt', {
      to: [ann],
      kind: 'message',
      text: 'Look',
      anchor: 'nope',
    });
    expect(missing.text).toBe('There is no piece "nope" on the table.');
  });

  it('asks everyone at the table, and closes on the first answer when asked to', async () => {
    const bo = (await workspace.players.join('Bo', 'guest')).player.id;
    session.subscribe(() => undefined, bo);
    const asked = (
      await call('prompt', { to: 'everyone', kind: 'confirm', text: 'Ready?', until: 'first' })
    ).json();
    expect(asked.to).toEqual(expect.arrayContaining([ann, bo]));
    expect(asked.to).not.toContain('claude');
    session.handle({ type: 'answer', prompt: asked.id as string, answer: true }, bo);
    expect((await call('list_prompts')).json()).toMatchObject([
      { open: false, closed: 'answered' },
    ]);
  });

  it('keeps open prompts with the table when it closes, and brings them back', async () => {
    const { id } = (
      await call('prompt', { to: [ann], kind: 'text', text: 'Name your farm' })
    ).json();
    await workspace.close();
    const reopened = await Workspace.open(session.project.dir, {
      watch: false,
      playerStore: new MemoryPlayerStore(),
    });
    try {
      expect(reopened.active.prompts.waitingFor(ann).map((p) => p.id)).toEqual([id]);
    } finally {
      await reopened.close();
    }
  });

  it('names the pieces a move changed, and those an undo put back', async () => {
    const { next } = (await call('wait_for_events', { seconds: 0 })).json();
    await call('move', { ids: ['worker.red.1'], to: [50, 50] });
    await call('undo');
    const page = (await call('wait_for_events', { since: next, seconds: 0 })).json();
    expect(page.events).toMatchObject([
      { kind: 'changed', change: 'apply', objects: ['worker.red.1'] },
      { kind: 'changed', change: 'undo', objects: ['worker.red.1'] },
    ]);
  });

  it('offers a run-game starter to clients', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('run-game');
    const got = await client.getPrompt({
      name: 'run-game',
      arguments: { rules: 'rules.md', style: 'tutorial' },
    });
    const first = got.messages[0]!.content as { text: string };
    expect(first.text).toContain('rules.md');
    expect(first.text).toContain('wait_for_events');
  });
});
