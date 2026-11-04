import { describe, expect, it } from 'vitest';
import { frontMatter } from '../overview/concepts.js';
import { resolveLinks } from '../overview/html.js';
import { linksIn, type Registry } from '../overview/links.js';
import { buildModel, checkModel } from '../overview/site.js';
import { cleanComment, firstSentence, readSource } from '../overview/source.js';

describe('reading a source file', () => {
  const text = `/**
 * Keeps score.
 *
 * More about it.
 */
import { x } from './x.js';

/** A change. Second sentence. */
export type Change =
  /** Add points. */
  | { type: 'add'; points: number }
  | { type: 'reset' };

export interface Score {
  /** Points so far. */
  points: number;
  name?: string;
}

export class Board {
  /** The score shown. */
  get score(): number {
    return 0;
  }
  private secret = 1;
  /** Clears the board. */
  clear(): void {}
}

function helper() {}
`;
  const { purpose, decls } = readSource('score.ts', text);

  it('takes the file comment as its purpose', () => {
    expect(purpose).toBe('Keeps score.\n\nMore about it.');
  });

  it('finds declarations with their docs and whether they are exported', () => {
    expect(decls.map((d) => [d.name, d.kind, d.exported])).toEqual([
      ['Change', 'type', true],
      ['Score', 'interface', true],
      ['Board', 'class', true],
      ['helper', 'function', false],
    ]);
    expect(decls[0]!.summary).toBe('A change.');
  });

  it('reads the cases of a tagged union', () => {
    const variants = decls[0]!.variants!;
    expect(variants.map((v) => [v.tag, v.doc])).toEqual([
      ['add', 'Add points.'],
      ['reset', undefined],
    ]);
    expect(variants[0]!.members).toEqual([
      { name: 'points', type: 'number', optional: false, doc: undefined },
    ]);
  });

  it('reads fields and the public side of classes', () => {
    expect(decls[1]!.members!.map((m) => [m.name, m.optional, m.doc])).toEqual([
      ['points', false, 'Points so far.'],
      ['name', true, undefined],
    ]);
    expect(decls[2]!.members!.map((m) => m.name)).toEqual(['score', 'clear()']);
  });

  it('falls back to the main declaration for a file without a comment', () => {
    const plain = readSource('a.ts', '/** Does a thing. */\nexport function a() {}\n');
    expect(plain.purpose).toBe('Does a thing.');
    const reExports = readSource('i.ts', '// Everything.\nexport * from "./a.js";\n');
    expect(reExports.purpose).toBe('Everything.');
  });

  it('tidies comments into text and finds the first sentence', () => {
    expect(cleanComment('/**\n * One.\n *   Two.\n */')).toBe('One.\n  Two.');
    expect(firstSentence('Holds `x.y`. Then more.')).toBe('Holds `x.y`.');
  });
});

describe('concept pages', () => {
  it('read their front matter', () => {
    const { fields, body } = frontMatter('---\ntitle: Undo\norder: 4\n---\nText\n');
    expect(fields).toEqual({ title: 'Undo', order: '4' });
    expect(body).toBe('Text\n');
  });

  it('link symbols, with labels and in tables', () => {
    const registry: Registry = new Map([
      ['core:Thing', { href: 'types/Thing.html', label: 'Thing' }],
    ]);
    const text = '[[core:Thing]] and [[core:Thing|it]] | [[core:Thing\\|that]] [[core:Gone]]';
    expect(linksIn(text)).toEqual(['core:Thing', 'core:Thing', 'core:Thing', 'core:Gone']);
    expect(resolveLinks(text, registry, '../')).toBe(
      '[`Thing`](../types/Thing.html) and [it](../types/Thing.html) | [that](../types/Thing.html) [[core:Gone]]',
    );
  });
});

describe('the architecture overview', () => {
  it('matches the code', { timeout: 60_000 }, async () => {
    const model = await buildModel();
    expect(checkModel(model)).toEqual([]);
    expect(model.tools.length).toBeGreaterThan(20);
    expect(model.routes.some((r) => r.path === '/ws')).toBe(true);
    expect(model.cli.map((c) => c.name)).toContain('play');

    const broken = { ...model, concepts: [{ ...model.concepts[0]!, markdown: '[[core:Gone]]' }] };
    expect(checkModel(broken)).toContain(
      `${model.concepts[0]!.path}: [[core:Gone]] names nothing in the code.`,
    );
  });
});
