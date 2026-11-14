import { beforeEach, describe, expect, it } from 'vitest';
import { ask, confirm, useDialogs } from '../../src/ui/dialogs';

beforeEach(() => useDialogs.setState({ open: undefined }));

/** The question open now, as the dialog host sees it. */
const open = () => useDialogs.getState().open;

describe('confirm', () => {
  it('opens a question and gives the answer once it is given', async () => {
    const answer = confirm({ title: 'Delete "token"?', action: 'Delete', danger: true });
    const shown = open();
    expect(shown?.question.title).toBe('Delete "token"?');
    if (shown?.kind !== 'confirm') throw new Error('Expected a yes-or-no question');
    shown.answer(true);
    await expect(answer).resolves.toBe(true);
    expect(open()).toBeUndefined();
  });
});

describe('ask', () => {
  it('gives the text trimmed, or nothing when the person backs out', async () => {
    const named = ask({ title: 'Rename "token"', label: 'New id', value: 'token' });
    const first = open();
    if (first?.kind !== 'ask') throw new Error('Expected a question for text');
    first.answer('  coin ');
    await expect(named).resolves.toBe('coin');

    const left = ask({ title: 'New table', label: 'Name' });
    const second = open();
    if (second?.kind !== 'ask') throw new Error('Expected a question for text');
    second.answer(undefined);
    await expect(left).resolves.toBeUndefined();
  });
});

describe('a question asked while another is open', () => {
  it('backs out of the one before', async () => {
    const first = confirm({ title: 'Start over?', action: 'Start over' });
    const second = ask({ title: 'New table', label: 'Name' });
    await expect(first).resolves.toBe(false);
    expect(open()?.question.title).toBe('New table');

    const third = confirm({ title: 'Delete?', action: 'Delete' });
    await expect(second).resolves.toBeUndefined();
    const shown = open();
    if (shown?.kind !== 'confirm') throw new Error('Expected a yes-or-no question');
    shown.answer(false);
    await expect(third).resolves.toBe(false);
  });
});
