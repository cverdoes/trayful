import type { PlayerPrompt, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { anchorOnScreen, bubbleAt } from '../../src/table/promptBubble';
import { exampleTable } from '../helpers';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

const message = (anchor?: string): PlayerPrompt => ({
  id: 'p1',
  from: 'Claude',
  kind: 'message',
  text: 'Look here',
  ...(anchor ? { anchor } : {}),
});

/** The table as the page sees it, panned and zoomed. */
function store() {
  return {
    table,
    view: { types: project.types },
    pageOf: (surface: string, [x, y]: readonly [number, number]): [number, number] | undefined =>
      surface === 'centre' ? [10 + x * 2, 20 + y * 2] : undefined,
  };
}

describe('prompt bubbles', () => {
  it('points at a piece on the table, where it is on screen', () => {
    const worker = table.objects['worker.red.1']!;
    const [x, y] = 'pos' in worker ? worker.pos : [0, 0];
    expect(anchorOnScreen(message('worker.red.1'), store())).toBe(
      `${Math.round(10 + x * 2)},${Math.round(20 + y * 2)}`,
    );
  });

  it('points at a place on a board', () => {
    expect(anchorOnScreen(message('main-board/market'), store())).toBe('-420,-240');
  });

  it('shows in the panel when it points at nothing in view', () => {
    expect(anchorOnScreen(message(), store())).toBeUndefined();
    expect(anchorOnScreen(message('nope'), store())).toBeUndefined();
    expect(
      anchorOnScreen(message('worker.red.1'), { ...store(), view: undefined }),
    ).toBeUndefined();
  });

  it('sits above what it points at, or below it near the top, inside the window', () => {
    expect(bubbleAt('500,400', 1000)).toMatchObject({ left: 500, top: 400 });
    expect(bubbleAt('500,400', 1000).transform).toContain('-100%');
    expect(bubbleAt('0,5', 1000)).toMatchObject({ left: 196, top: 16 });
    expect(bubbleAt('0,5', 1000).transform).toBe('translate(-50%, 24px)');
    expect(bubbleAt('990,400', 1000).left).toBe(804);
  });
});
