import type { Command, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItems, surfaceId, surfaceItems, type MenuContext } from '../../src/table/surfaceMenu';
import { sendTargets } from '../../src/table/surfaces';
import { after, exampleTable } from '../helpers';

let project: ResolvedProject;
let table: TableState;
/** The example table with a side table and a seat Alice sits at. */
let seated: TableState;
let sent: Command[];
let answers: (string | undefined)[];

beforeAll(async () => {
  ({ project, table } = await exampleTable());
  seated = after(
    project,
    table,
    { type: 'addSurface', id: 'side', name: 'Side table' },
    { type: 'addSurface', id: 'red', name: 'Red', seat: true },
    { type: 'sit', surface: 'red', player: 'alice' },
    { type: 'move', ids: ['worker.red.1'], to: 'surface:side' },
  );
});

beforeEach(() => {
  sent = [];
  answers = [];
});

const context = (player?: string, confirm = true): MenuContext => ({
  table: seated,
  player,
  command: (command) => sent.push(command),
  // As the dialog does, the answer comes back trimmed.
  ask: () => Promise.resolve(answers.shift()?.trim()),
  confirm: () => Promise.resolve(confirm),
});
const surface = (id: string) => seated.surfaces!.find((s) => s.id === id)!;
/** Picks a menu item, and waits for the answer to a question it asks. */
const pick = async (items: { label: string; onSelect: () => void }[], label: string) => {
  items.find((item) => item.label === label)!.onSelect();
  await new Promise((resolve) => setTimeout(resolve));
};
const labels = (items: { label: string }[]) => items.map((item) => item.label);

describe('surfaceId', () => {
  it('makes an id from a name, not taken on the table', () => {
    expect(surfaceId('Red player', seated)).toBe('red-player');
    expect(surfaceId('  Blå / Grön! ', seated)).toBe('bl-gr-n');
    expect(surfaceId('Side', seated)).toBe('side-2');
    expect(surfaceId('Centre', seated)).toBe('centre-2');
    expect(surfaceId('!!!', seated)).toBe('surface');
  });
});

describe('adding a surface', () => {
  it('adds a shared surface or a seat under the name given', async () => {
    answers = [' Discard ', 'Blue'];
    await pick(addItems(context()), 'Add a surface…');
    await pick(addItems(context()), 'Add a seat…');
    expect(sent).toEqual([
      { type: 'addSurface', id: 'discard', name: 'Discard' },
      { type: 'addSurface', id: 'blue', name: 'Blue', seat: true },
    ]);
  });

  it('adds nothing without a name', async () => {
    answers = [undefined, '  '];
    await pick(addItems(context()), 'Add a surface…');
    await pick(addItems(context()), 'Add a seat…');
    expect(sent).toEqual([]);
  });
});

describe('changing a surface', () => {
  it('only renames and colours the Centre', async () => {
    const items = surfaceItems({ id: 'centre', name: 'Centre' }, context('alice'));
    expect(labels(items)).toEqual(['Rename…', 'Colour…']);
    answers = ['Middle'];
    await pick(items, 'Rename…');
    expect(sent).toEqual([{ type: 'editSurface', id: 'centre', name: 'Middle' }]);
  });

  it('keeps the name when the answer is the same or none', async () => {
    answers = ['Red', undefined];
    await pick(surfaceItems(surface('red'), context()), 'Rename…');
    await pick(surfaceItems(surface('red'), context()), 'Rename…');
    expect(sent).toEqual([]);
  });

  it('lets a player sit down at a seat or stand up from their own', async () => {
    expect(labels(surfaceItems(surface('red'), context('alice')))).toContain('Stand up');
    await pick(surfaceItems(surface('red'), context('alice')), 'Stand up');
    await pick(surfaceItems(surface('red'), context('bob')), 'Sit here');
    expect(sent).toEqual([
      { type: 'sit', surface: 'red' },
      { type: 'sit', surface: 'red', player: 'bob' },
    ]);
  });

  it('offers no seat to someone who has not joined, or at a surface that is no seat', () => {
    expect(labels(surfaceItems(surface('red'), context()))).toEqual([
      'Rename…',
      'Colour…',
      'No longer a seat',
      'Remove…',
    ]);
    expect(labels(surfaceItems(surface('side'), context('bob')))).toEqual([
      'Rename…',
      'Colour…',
      'Make it a seat',
      'Remove…',
    ]);
  });

  it('colours a surface, naming the project colours, or takes its colour off', async () => {
    const asked: string[] = [];
    const ctx: MenuContext = {
      ...context(),
      colors: ['red', 'green'],
      ask: (question) => {
        asked.push(question.text ?? '');
        return Promise.resolve(answers.shift()?.trim());
      },
    };
    answers = [' red ', undefined];
    await pick(surfaceItems(surface('side'), ctx), 'Colour…');
    await pick(surfaceItems(surface('side'), ctx), 'Colour…');
    answers = ['red', ''];
    await pick(surfaceItems({ ...surface('side'), color: 'red' }, ctx), 'Colour…');
    await pick(surfaceItems({ ...surface('side'), color: 'red' }, ctx), 'Colour…');
    expect(asked[0]).toContain('such as red, green, or a CSS colour');
    expect(sent).toEqual([
      { type: 'editSurface', id: 'side', color: 'red' },
      { type: 'editSurface', id: 'side', color: '' },
    ]);
  });

  it('makes a surface a seat or not', async () => {
    await pick(surfaceItems(surface('side'), context()), 'Make it a seat');
    await pick(surfaceItems(surface('red'), context()), 'No longer a seat');
    expect(sent).toEqual([
      { type: 'editSurface', id: 'side', seat: true },
      { type: 'editSurface', id: 'red', seat: false },
    ]);
  });

  it('removes a surface once confirmed, sending what lies on it to the Centre', async () => {
    await pick(surfaceItems(surface('side'), context(undefined, false)), 'Remove…');
    expect(sent).toEqual([]);
    await pick(surfaceItems(surface('side'), context()), 'Remove…');
    expect(sent).toEqual([{ type: 'removeSurface', id: 'side', to: 'centre' }]);
    expect(after(project, seated, ...sent).objects['worker.red.1']!.surface).toBeUndefined();
  });
});

describe('sendTargets', () => {
  it('offers every surface but the one the selection lies on', () => {
    expect(sendTargets(seated, ['worker.red.1'])).toEqual({
      ids: ['worker.red.1'],
      to: [
        { id: 'centre', name: 'Centre' },
        { id: 'red', name: 'Red' },
      ],
    });
  });

  it('offers them all for a selection across surfaces', () => {
    const { to } = sendTargets(seated, ['worker.red.1', 'worker.red.2']);
    expect(to.map((s) => s.id)).toEqual(['centre', 'side', 'red']);
  });

  it('offers nothing without surfaces, a selection, or anything that may move', () => {
    expect(sendTargets(table, ['worker.red.1']).to).toEqual([]);
    expect(sendTargets(seated, []).to).toEqual([]);
    const locked = after(project, seated, { type: 'lock', ids: ['worker.red.1'], locked: true });
    expect(sendTargets(locked, ['worker.red.1', 'gone']).to).toEqual([]);
  });
});
