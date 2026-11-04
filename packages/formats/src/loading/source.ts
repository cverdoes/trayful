import { readFile } from 'node:fs/promises';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Document, type Node } from 'yaml';
import type { z } from 'zod';
import { flattenIssues, type Diagnostic } from './diagnostics.js';

/** A parsed YAML file that can map data paths back to line and column numbers. */
export class SourceFile {
  private constructor(
    readonly file: string,
    readonly doc: Document,
    private readonly lines: LineCounter,
  ) {}

  static parse(file: string, text: string): SourceFile {
    const lines = new LineCounter();
    const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false, uniqueKeys: true });
    return new SourceFile(file, doc, lines);
  }

  static async read(absPath: string, file: string): Promise<SourceFile> {
    return SourceFile.parse(file, await readFile(absPath, 'utf8'));
  }

  /** YAML syntax errors and warnings, as diagnostics. */
  syntaxDiagnostics(): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const [severity, list] of [
      ['error', this.doc.errors],
      ['warning', this.doc.warnings],
    ] as const) {
      for (const e of list) {
        const pos = this.lines.linePos(e.pos[0]);
        out.push({
          severity,
          file: this.file,
          line: pos.line,
          col: pos.col,
          message: firstLine(e.message),
        });
      }
    }
    return out;
  }

  toJS(): unknown {
    return this.doc.toJS();
  }

  /** Line and column of the deepest node that exists along `path`. */
  locate(path: (string | number)[]): { line: number; col: number } | undefined {
    let node: Node | null | undefined = this.doc.contents;
    let offset = node?.range?.[0];
    for (const key of path) {
      if (isMap(node)) {
        const pair = node.items.find((p) => (isScalar(p.key) ? p.key.value : p.key) === key);
        if (!pair) break;
        // Point at the key: for `size: abc` that is the same line as the value,
        // and for nested maps it is the line the author recognises.
        const keyNode = pair.key as Node | null;
        node = pair.value as Node | null;
        offset = keyNode?.range?.[0] ?? node?.range?.[0] ?? offset;
      } else if (isSeq(node) && typeof key === 'number') {
        const item = node.items[key] as Node | undefined;
        if (!item) break;
        node = item;
        offset = item.range?.[0] ?? offset;
      } else {
        break;
      }
    }
    return offset === undefined ? undefined : this.lines.linePos(offset);
  }

  diagnostic(
    path: (string | number)[],
    message: string,
    severity: Diagnostic['severity'] = 'error',
  ): Diagnostic {
    return { severity, file: this.file, ...this.locate(path), path, message };
  }

  /** Validates the file's data against a schema, returning the data and any problems. */
  validate<S extends z.ZodType>(
    schema: S,
  ): { data: z.infer<S> | undefined; diagnostics: Diagnostic[] } {
    const syntax = this.syntaxDiagnostics();
    if (syntax.some((d) => d.severity === 'error')) return { data: undefined, diagnostics: syntax };
    const result = this.validateValue(schema, this.toJS(), []);
    return { data: result.data, diagnostics: [...syntax, ...result.diagnostics] };
  }

  /** Validates one value taken from this file, reporting problems relative to `at`. */
  validateValue<S extends z.ZodType>(
    schema: S,
    value: unknown,
    at: (string | number)[],
  ): { data: z.infer<S> | undefined; diagnostics: Diagnostic[] } {
    const result = schema.safeParse(value);
    if (result.success) return { data: result.data, diagnostics: [] };
    const issues = flattenIssues(result.error.issues, at).map((i) =>
      this.diagnostic(i.path, i.message),
    );
    return { data: undefined, diagnostics: issues };
  }
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}
