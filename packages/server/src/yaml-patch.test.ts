import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseYaml, patchNode, yamlText } from './yaml-patch.js';

/** Patches the whole document to hold `value` and returns the text it writes. */
function patched(text: string, value: unknown): string {
  const doc = parseYaml(text);
  const node = patchNode(doc, doc.contents, value);
  if (node !== doc.contents) doc.contents = node as typeof doc.contents;
  return yamlText(doc);
}

describe('patchNode', () => {
  it('changes only the values that differ, keeping comments and flow style', () => {
    const text = [
      '# A card',
      'id: event',
      'size: [63, 88] # poker size',
      'front:',
      '  # white paper',
      '  fill: white',
      '',
    ].join('\n');
    expect(patched(text, { id: 'event', size: [63, 88], front: { fill: 'ivory' } })).toBe(
      text.replace('fill: white', 'fill: ivory'),
    );
  });

  it('adds new keys at the end and removes keys that are gone', () => {
    const text = 'id: event\nname: Event # shown on the table\ncorner: 3\n';
    expect(patched(text, { id: 'event', name: 'Event', size: [44, 63] })).toBe(
      'id: event\nname: Event # shown on the table\nsize: [44, 63]\n',
    );
  });

  it('edits list items in place and drops or adds items at the end', () => {
    const text = 'layers:\n  - text: a # first\n  - text: b\n';
    expect(patched(text, { layers: [{ text: 'a' }, { text: 'c' }, { shape: 'rect' }] })).toBe(
      'layers:\n  - text: a # first\n  - text: c\n  - shape: rect\n',
    );
    expect(patched(text, { layers: [{ text: 'a' }] })).toBe('layers:\n  - text: a # first\n');
  });

  it('keeps each comment with its own item when items are removed or reordered', () => {
    const text = 'layers:\n  - text: a # first\n  - text: b # second\n  - text: c # third\n';
    expect(patched(text, { layers: [{ text: 'b' }, { text: 'c' }] })).toBe(
      'layers:\n  - text: b # second\n  - text: c # third\n',
    );
    expect(patched(text, { layers: [{ text: 'c' }, { text: 'a' }, { text: 'x' }] })).toBe(
      'layers:\n  - text: c # third\n  - text: a # first\n  - text: x\n',
    );
  });

  it('replaces a value whose kind changed', () => {
    expect(patched('size: 30\n', { size: [30, 40] })).toBe('size: [30, 40]\n');
    expect(patched('fields:\n  title: string\n', { fields: { title: { type: 'string' } } })).toBe(
      'fields:\n  title:\n    type: string\n',
    );
  });
});

describe('yamlText', () => {
  it('writes every example file back exactly as it was read', async () => {
    const root = fileURLToPath(new URL('../../../examples', import.meta.url));
    const files = (await readdir(root, { recursive: true })).filter(
      (file) => file.endsWith('.yaml') && !file.includes('tables'),
    );
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = await readFile(path.join(root, file), 'utf8');
      expect(yamlText(parseYaml(text)), file).toBe(text);
    }
  });
});

describe('new values', () => {
  it('take the style of the file: keys in order, short lists and siblings on one line', () => {
    const text = 'id: event\nsize: [63, 88]\nfront:\n  layers:\n    - { text: a, at: [5, 5] }\n';
    expect(
      patched(text, {
        id: 'event',
        name: 'Event',
        size: [63, 88],
        front: {
          layers: [
            { text: 'a', at: [5, 5] },
            { text: '{{title}}', at: [5, 9] },
          ],
        },
        back: { layers: [{ shape: 'rect', size: [10, 20] }] },
      }),
    ).toBe(
      [
        'id: event',
        'name: Event',
        'size: [63, 88]',
        'front:',
        '  layers:',
        '    - { text: a, at: [5, 5] }',
        "    - { text: '{{title}}', at: [5, 9] }",
        'back:',
        '  layers:',
        '    - shape: rect',
        '      size: [10, 20]',
        '',
      ].join('\n'),
    );
  });
});
