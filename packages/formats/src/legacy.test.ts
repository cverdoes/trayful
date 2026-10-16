import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './diagnostics.js';
import { loadProject } from './load.js';
import type { ResolvedType } from './resolved.js';

const legacy = fileURLToPath(new URL('../fixtures/legacy-harvest-moon', import.meta.url));
const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

/** A component as written, without what the loader adds. */
function written({ source: _source, normalizedFields: _fields, ...type }: ResolvedType) {
  return type;
}

describe('loading a project in the first format', () => {
  it('loads with one warning that asks for a migration', async () => {
    const result = await loadProject(legacy);
    expect(result.diagnostics.map((d) => formatDiagnostic(d))).toEqual([
      expect.stringMatching(
        /^trayful\.yaml:\d+:\d+ {2}warning {2}This project is in trayful\/1\. .*trayful migrate/,
      ),
    ]);
    expect(result.project).toMatchObject({ legacy: true, manifest: { format: 'trayful/2' } });
  });

  it('gives the same components, decks and setups as the migrated example', async () => {
    const old = (await loadProject(legacy)).project!;
    const current = (await loadProject(example)).project!;
    expect(current.legacy).toBe(false);
    expect(old.components).toEqual(current.components);
    expect(old.decks).toEqual(current.decks);
    expect(old.setups).toEqual(current.setups);
    expect(old.assets.colors).toEqual(current.assets.colors);
    expect(old.assets.images).toEqual({
      'card-back': current.assets.images['card-back'],
      board: current.assets.images.board,
    });
  });

  it('upgrades every type as the example writes it, apart from the hand-made changes', async () => {
    const old = (await loadProject(legacy)).project!;
    const current = (await loadProject(example)).project!;
    expect(Object.keys(old.types).sort()).toEqual(Object.keys(current.types).sort());
    for (const id of ['main-board', 'worker', 'score-marker', 'coins']) {
      expect(written(old.types[id]!), id).toEqual(written(current.types[id]!));
    }
    // By hand, the example's card text became labels and its die shows a sheet of pips.
    const { face: oldFace, ...oldCard } = written(old.types['action-card']!);
    const { face: newFace, ...newCard } = written(current.types['action-card']!);
    expect(oldCard).toEqual(newCard);
    expect(oldFace).toMatchObject({ corner: 3, fill: '{{suit}}' });
    expect(oldFace!.layers).toHaveLength(5);
    expect(newFace!.labels).toHaveLength(3);
    expect(written(old.types.d6!)).toEqual({ ...written(current.types.d6!), face: { corner: 2 } });
  });

  it('locks the board in the setup, as boards used to start locked', async () => {
    const old = (await loadProject(legacy)).project!;
    expect(old.setups['2-player']!.steps[0]).toEqual({
      place: 'main-board',
      at: [0, 0],
      lock: true,
    });
  });

  it('reports problems in old libraries at their old paths', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-'));
    const files: Record<string, string> = {
      'trayful.yaml':
        'name: Old\nformat: trayful/1\nlibraries: [lib.yaml]\ninventory: inventory.yaml\n',
      'lib.yaml': [
        'kind: library',
        'types:',
        '  - id: card',
        '    base: card',
        '    size: [63, 88]',
        '    back:',
        '      layers:',
        '        - { image: missing.svg }',
        '  - id: broken',
        '    base: card',
        '    size: wide',
        '  - id: card',
        '    base: token',
        '    size: 10',
      ].join('\n'),
      'inventory.yaml': 'kind: inventory\ncomponents:\n  - type: broken\n  - type: card\n',
    };
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), text);
    }
    const result = await loadProject(dir);
    expect(result.diagnostics.map((d) => formatDiagnostic(d)).slice(1)).toEqual([
      'lib.yaml:11:5  error  expected number, received string (at types[1].size)',
      'lib.yaml:8:13  error  Image "missing.svg" not found in the project folder. (at types[0].back.layers[0].image)',
      'lib.yaml:12:5  error  "card" is already defined in lib.yaml. (at types[2].id)',
    ]);
    expect(result.project).toBeUndefined();
  });
});
