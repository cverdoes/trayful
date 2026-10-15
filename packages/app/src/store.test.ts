import type { ServerMessage, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { after, exampleTable } from './testing';

let project: ResolvedProject;
let table: TableState;
const initial = useStore.getState();

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

beforeEach(() => {
  useStore.setState(initial, true);
});

const state = (revision: number, on = table, activity?: object): ServerMessage =>
  ({
    type: 'state',
    state: { ...on, hands: {} },
    revision,
    canUndo: true,
    canRedo: false,
    activity,
  }) as ServerMessage;

describe('select', () => {
  it('replaces, adds to or toggles the selection', () => {
    const { select } = useStore.getState();
    select(['a', 'b']);
    select(['b', 'c'], 'add');
    expect(useStore.getState().selection).toEqual(['a', 'b', 'c']);
    select(['a', 'd'], 'toggle');
    expect(useStore.getState().selection).toEqual(['b', 'c', 'd']);
    select(['e']);
    expect(useStore.getState().selection).toEqual(['e']);
  });
});

describe('receive', () => {
  it('takes newer tables and ignores older ones', () => {
    const { receive } = useStore.getState();
    receive(state(3));
    expect(useStore.getState()).toMatchObject({ revision: 3, canUndo: true });
    receive(state(2, { ...table, objects: {} }));
    expect(useStore.getState().table?.objects).toBe(table.objects);
  });

  it('drops selected objects that went into a stack or away', () => {
    useStore.getState().select(['action-card.raid.1', 'coins', 'gone']);
    const stacked = after(project, table, {
      type: 'stack',
      ids: ['action-card.raid.1'],
      onto: 'deck:actions',
    });
    useStore.getState().receive(state(1, stacked));
    expect(useStore.getState().selection).toEqual(['coins']);
  });

  it('shows what someone else did, but not what this player did', () => {
    useStore.setState({
      me: {
        player: { id: 'alice', name: 'Alice', color: 'red', kind: 'person', role: 'host' },
        host: true,
        invited: false,
        joined: true,
      },
    });
    const { receive } = useStore.getState();
    receive(state(1, table, { text: 'drew a card', by: 'agent', player: 'agent' }));
    expect(useStore.getState().activity).toMatchObject({
      name: 'Agent',
      agent: true,
      text: 'drew a card',
    });
    receive(
      state(2, table, { text: 'flipped a card', by: 'person', player: 'alice', name: 'Alice' }),
    );
    expect(useStore.getState().activity?.text).toBe('drew a card');
  });

  it('keeps the project, its problems, the players and errors', () => {
    const { receive } = useStore.getState();
    receive({ type: 'problems', problems: ['bad file'] });
    expect(useStore.getState().problems).toEqual(['bad file']);
    receive({ type: 'project', view: { project: 'p' } } as ServerMessage);
    expect(useStore.getState()).toMatchObject({ view: { project: 'p' }, problems: undefined });
    receive({ type: 'players', players: [] });
    receive({ type: 'error', message: 'No.' });
    expect(useStore.getState()).toMatchObject({ error: { message: 'No.' }, redrawKey: 1 });
    receive({ type: 'snapshot-request', id: 'x' });
    expect(useStore.getState().revision).toBe(-1);
  });
});
