import type { ComponentType } from '@trayful/formats/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../src/store';
import type { Library } from '../../src/design/api';
import {
  addImage,
  renameDraftField,
  renameDraftType,
  renameImage,
} from '../../src/design/projectEdits';
import { openType, useDesign } from '../../src/design/store';

const card: ComponentType = {
  id: 'card',
  is: 'piece',
  size: [63, 88],
  fields: { title: { type: 'string' } },
  face: { image: 'art' },
};
const library: Library = {
  files: { 'library/cards.yaml': 'v1' },
  types: { card: 'library/cards.yaml' },
};

interface Call {
  url: string;
  body: unknown;
}

/** A stand-in for the server: records each call, answers `reply`, or fails with `error`. */
function fakeServer() {
  const server = {
    calls: [] as Call[],
    reply: library as unknown,
    error: undefined as string | undefined,
  };
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    server.calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const [body, status] = server.error ? [{ error: server.error }, 400] : [server.reply, 200];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  return server;
}

/** The types the project has, as the server last sent them. */
function projectHas(...types: ComponentType[]) {
  useStore.setState({
    view: { project: 'game', types: Object.fromEntries(types.map((t) => [t.id, t])) } as never,
  });
}

let server: ReturnType<typeof fakeServer>;
const initial = useDesign.getState();

beforeEach(() => {
  server = fakeServer();
  useDesign.setState({ ...initial, library }, true);
  projectHas(card);
  openType(card);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renameDraftType', () => {
  it('asks the server to rename the type, and shows it under its new name', async () => {
    projectHas(card, { ...card, id: 'deck-card' });
    await renameDraftType('deck-card');
    expect(server.calls).toEqual([
      { url: '/api/types/card/rename?project=game', body: { to: 'deck-card' } },
    ]);
    expect(useDesign.getState().draft?.id).toBe('deck-card');
  });

  it('does nothing for an empty or unchanged name', async () => {
    await renameDraftType('');
    await renameDraftType('card');
    expect(server.calls).toEqual([]);
  });

  it('renames nothing while the type cannot be saved', async () => {
    useDesign.setState({ status: 'invalid' });
    await renameDraftType('deck-card');
    expect(server.calls).toEqual([]);
    expect(useDesign.getState().message).toBe(
      'Fix the problems first: a rename needs the type saved.',
    );
  });

  it("shows the server's reason when it refuses", async () => {
    server.error = 'A type named "deck-card" already exists.';
    await renameDraftType('deck-card');
    expect(useDesign.getState().message).toBe('A type named "deck-card" already exists.');
  });
});

describe('renameDraftField', () => {
  it('renames a field the file has on the server, and keeps showing the type', async () => {
    const renamed = { ...card, fields: { name: { type: 'string' as const } } };
    projectHas(renamed);
    const inDraft = vi.fn();
    await renameDraftField('title', 'name', inDraft);
    expect(server.calls).toEqual([
      { url: '/api/types/card/fields/title/rename?project=game', body: { to: 'name' } },
    ]);
    expect(inDraft).not.toHaveBeenCalled();
    expect(useDesign.getState().draft?.fields).toEqual({ name: { type: 'string' } });
  });

  it('renames a field that is not saved yet only in the draft', async () => {
    const inDraft = vi.fn();
    await renameDraftField('cost', 'price', inDraft);
    expect(inDraft).toHaveBeenCalled();
    expect(server.calls).toEqual([]);
  });

  it('does nothing for an empty or unchanged name', async () => {
    const inDraft = vi.fn();
    await renameDraftField('title', '', inDraft);
    await renameDraftField('title', 'title', inDraft);
    expect(inDraft).not.toHaveBeenCalled();
    expect(server.calls).toEqual([]);
  });
});

describe('renameImage', () => {
  it('renames the image, and shows the type again once it uses the new name', async () => {
    server.reply = { ...library, name: 'artwork' };
    projectHas({ ...card, face: { image: 'artwork' } });
    await renameImage('art', 'artwork');
    expect(server.calls).toEqual([
      { url: '/api/assets/images/art/rename?project=game', body: { to: 'artwork' } },
    ]);
    expect(useDesign.getState().draft?.face).toEqual({ image: 'artwork' });
  });

  it('waits while the type still shows the old name, in a layer too', async () => {
    projectHas({ ...card, face: { layers: [{ image: 'art' }] } });
    await renameImage('art', 'artwork');
    expect(useDesign.getState().draft?.face).toEqual({ image: 'art' });
  });

  it('refuses while the type being edited cannot be saved', async () => {
    useDesign.setState({ status: 'invalid' });
    await expect(renameImage('art', 'artwork')).rejects.toThrow(
      'Fix the problems with "card" first: a rename needs it saved.',
    );
    expect(server.calls).toEqual([]);
  });
});

describe('addImage', () => {
  it('saves a dropped picture into the assets and shows it on that side', async () => {
    server.reply = { name: 'goblin', file: 'assets/goblin.png' };
    await addImage({ name: 'Goblin.PNG', base64: 'aGk=' }, 'front');
    expect(server.calls).toEqual([
      {
        url: '/api/assets/images?project=game',
        body: { file: 'assets/goblin.png', base64: 'aGk=' },
      },
    ]);
    expect(useDesign.getState().draft?.face).toEqual({ image: 'goblin' });
    expect(useDesign.getState().side).toBe('front');
  });

  it('says why when the picture could not be saved', async () => {
    server.error = 'The file is not an image.';
    await addImage({ name: 'notes.txt', base64: 'aGk=' }, 'back');
    expect(useDesign.getState().message).toBe('Could not add the image: The file is not an image.');
    expect(useDesign.getState().draft?.face).toEqual({ image: 'art' });
  });
});
