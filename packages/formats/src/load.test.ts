import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from './diagnostics.js';
import { loadProject } from './load.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

/** Writes a small project to a temp folder. Files not given use a valid default. */
async function project(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-'));
  const defaults: Record<string, string> = {
    'trayful.yaml':
      'name: Test\nformat: trayful/1\nlibraries: [lib.yaml]\ninventory: inventory.yaml\n',
    'lib.yaml': [
      'kind: library',
      'types:',
      '  - id: card',
      '    base: card',
      '    size: [63, 88]',
      '    fields:',
      '      name: string',
      '      suit: { enum: [red, blue] }',
      '      cost: { type: int, default: 0 }',
      '    front:',
      '      layers:',
      "        - { text: '{{name}}' }",
      '  - id: board',
      '    base: board',
      '    size: [300, 200]',
      '    snap:',
      '      - { id: row, grid: { origin: [10, 10], cols: 3, rows: 1, cell: 70 } }',
    ].join('\n'),
    'inventory.yaml': [
      'kind: inventory',
      'components:',
      '  - type: card',
      '    deck: main',
      '    items:',
      '      - { name: Alpha, suit: red, count: 2 }',
      '      - { name: Beta, suit: blue }',
      '  - type: board',
    ].join('\n'),
  };
  for (const [file, text] of Object.entries({ ...defaults, ...files })) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

const messages = (r: Awaited<ReturnType<typeof loadProject>>) =>
  r.diagnostics.map((d) => formatDiagnostic(d));

describe('loadProject', () => {
  it('reports a default setup that does not exist', async () => {
    const dir = await project({
      'trayful.yaml':
        'name: Test\nformat: trayful/1\nlibraries: [lib.yaml]\ninventory: inventory.yaml\nsetup: start\n',
    });
    const result = await loadProject(dir);
    expect(messages(result).join('\n')).toMatch(
      /Unknown setup "start"\. There are no setup files\./,
    );
  });

  it('loads the Harvest Moon example without problems', async () => {
    const result = await loadProject(example);
    expect(messages(result)).toEqual([]);
    const p = result.project!;
    expect(Object.keys(p.types).sort()).toEqual([
      'action-card',
      'coins',
      'd6',
      'main-board',
      'score-marker',
      'worker',
    ]);
    expect(p.components).toHaveLength(26);
    expect(p.decks.actions).toHaveLength(10);
    expect(Object.keys(p.setups)).toEqual(['2-player']);
  });

  it('expands rows, copies, CSV data and combinations into stable ids', async () => {
    const p = (await loadProject(example)).project!;
    const ids = p.components.map((c) => c.id);
    expect(ids).toContain('action-card.harvest.3');
    expect(ids).toContain('action-card.market-day.1');
    expect(ids).toContain('worker.red.5');
    expect(ids).toContain('score-marker.green');
    expect(ids).toContain('main-board');
    const storm = p.components.find((c) => c.id === 'action-card.storm')!;
    expect(storm.data).toEqual({
      cost: 3,
      name: 'Storm',
      suit: 'red',
      text: 'Every player discards 1 grain.',
    });
  });

  it('applies field defaults and entry data', async () => {
    const p = (await loadProject(await project({}))).project!;
    expect(p.components.map((c) => c.id)).toEqual([
      'card.alpha.1',
      'card.alpha.2',
      'card.beta',
      'board',
    ]);
    expect(p.components[2]!.data).toEqual({ cost: 0, name: 'Beta', suit: 'blue' });
  });

  it('reports schema problems with file, line and column', async () => {
    const dir = await project({
      'lib.yaml': [
        'kind: library',
        'types:',
        '  - id: card',
        '    base: card',
        '    size: [63, wide]',
        '    colour: red',
      ].join('\n'),
      'inventory.yaml': 'kind: inventory\ncomponents: []\n',
    });
    expect(messages(await loadProject(dir))).toEqual([
      'lib.yaml:5:16  error  expected number, received string (at types[0].size[1])',
      'lib.yaml:6:5  error  Unknown key: "colour". (at types[0].colour)',
    ]);
  });

  it('reports YAML syntax errors', async () => {
    const dir = await project({
      'inventory.yaml': 'kind: inventory\ncomponents:\n  - type: [card\n',
    });
    const [first] = (await loadProject(dir)).diagnostics;
    expect(first).toMatchObject({ file: 'inventory.yaml', severity: 'error' });
    expect(first!.line).toBeGreaterThan(0);
  });

  it('checks inventory rows against the type fields', async () => {
    const dir = await project({
      'inventory.yaml': [
        'kind: inventory',
        'components:',
        '  - type: card',
        '    items:',
        '      - { name: Alpha, suit: green }',
        '      - { name: Beta, suit: red, colour: red }',
        '      - { suit: red }',
        '  - type: crad',
      ].join('\n'),
    });
    expect(messages(await loadProject(dir))).toEqual([
      'inventory.yaml:5:24  error  "suit" must be one of "red", "blue". (at components[0].items[0].suit)',
      'inventory.yaml:6:34  error  "colour" is not a field of "card". (at components[0].items[1].colour)',
      'inventory.yaml:7:9  error  Missing value for field "name". (at components[0].items[2])',
      'inventory.yaml:8:5  error  Unknown type "crad". Define it in a library first. (at components[1].type)',
    ]);
  });

  it('reports CSV problems by CSV line', async () => {
    const dir = await project({
      'inventory.yaml': 'kind: inventory\ncomponents:\n  - type: card\n    from: cards.csv\n',
      'cards.csv': 'name,suit,cost\nAlpha,red,1\nBeta,blue,lots\n',
    });
    expect(messages(await loadProject(dir))).toEqual([
      'cards.csv:3:1  error  "cost" must be a number. (column "cost")',
    ]);
  });

  it('checks library rules per primitive and template fields', async () => {
    const dir = await project({
      'lib.yaml': [
        'kind: library',
        'types:',
        '  - id: pawn',
        '    base: meeple',
        '    size: 16',
        '    back: { fill: red }',
        '    range: [0, 5]',
        '    front:',
        "      layers: [{ text: '{{label}}' }]",
      ].join('\n'),
      'inventory.yaml': 'kind: inventory\ncomponents: []\n',
    });
    expect(messages(await loadProject(dir))).toEqual([
      'lib.yaml:6:5  error  A meeple has one side, so it cannot have a "back". (at types[0].back)',
      'lib.yaml:7:5  error  "range" is only for counters. (at types[0].range)',
      'lib.yaml:9:18  error  "{{label}}" is not a field of "pawn". (at types[0].front.layers[0].text)',
    ]);
  });

  it('does not cascade errors from a broken type', async () => {
    const dir = await project({
      'lib.yaml': 'kind: library\ntypes:\n  - id: card\n    base: card\n    size: oops\n',
      'inventory.yaml': 'kind: inventory\ncomponents:\n  - type: card\n    deck: main\n',
      'setups/start.yaml': 'kind: setup\nsteps:\n  - shuffle: main\n',
    });
    const result = await loadProject(dir);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.file).toBe('lib.yaml');
  });

  it('checks setup references to decks and snap spots', async () => {
    const dir = await project({
      'setups/start.yaml': [
        'kind: setup',
        'steps:',
        '  - place: { deck: main }',
        '    at: board/row/1',
        '  - deal: { from: side, to: board/row, count: 2 }',
        '  - place: board',
        '    at: board/row/3',
        '  - place: board',
        '    at: board/column',
      ].join('\n'),
    });
    expect(messages(await loadProject(dir))).toEqual([
      'setups/start.yaml:5:13  error  Unknown deck "side". (at steps[1].deal.from)',
      'setups/start.yaml:7:5  error  Spot 3 is out of range; "row" has spots 0 to 2. (at steps[2].at)',
      'setups/start.yaml:9:5  error  "board" has no snap target "column". (at steps[3].at)',
    ]);
  });

  it('reports a missing manifest', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-'));
    expect(messages(await loadProject(dir))).toEqual(['trayful.yaml  error  File not found.']);
  });
});
