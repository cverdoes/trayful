// Reading a project's files while loading it, and collecting what is wrong with them.
import { access } from 'node:fs/promises';
import path from 'node:path';
import { glob, isDynamicPattern } from 'tinyglobby';
import type { Diagnostic } from './diagnostics.js';
import { byCodeUnit } from './order.js';
import { SourceFile } from './source.js';

/** The files of one project being loaded, and the diagnostics found so far. */
export class ProjectFiles {
  readonly diagnostics: Diagnostic[] = [];
  private readonly sources = new Map<string, SourceFile>();

  constructor(readonly dir: string) {}

  /** A YAML file, parsed; undefined (with an error) when it cannot be read. */
  async read(file: string): Promise<SourceFile | undefined> {
    try {
      const source = await SourceFile.read(path.join(this.dir, file), file);
      this.sources.set(file, source);
      return source;
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      this.error(
        file,
        missing ? 'File not found.' : `Could not read file: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  /** A file read earlier. */
  source(file: string): SourceFile {
    return this.sources.get(file)!;
  }

  async exists(file: string): Promise<boolean> {
    try {
      await access(path.join(this.dir, file));
      return true;
    } catch {
      return false;
    }
  }

  /** The files matching each pattern, reporting patterns that match nothing. */
  async expandGlobs(
    patterns: string[],
    source: SourceFile,
    at: (string | number)[],
  ): Promise<string[]> {
    const files: string[] = [];
    for (const [i, pattern] of patterns.entries()) {
      const matches = await this.match(pattern);
      if (matches.length === 0) {
        this.diagnostics.push(source.diagnostic([...at, i], `No files match "${pattern}".`));
      }
      files.push(...matches.toSorted(byCodeUnit));
    }
    return [...new Set(files)];
  }

  private async match(pattern: string): Promise<string[]> {
    if (isDynamicPattern(pattern))
      return glob(pattern, { cwd: this.dir, expandDirectories: false });
    return (await this.exists(pattern)) ? [pattern] : [];
  }

  error(file: string, message: string, extra: Partial<Diagnostic> = {}): void {
    this.diagnostics.push({ severity: 'error', file, message, ...extra });
  }

  /** Records problems with a file's data, each at its path inside the file. */
  report(
    file: string,
    at: (string | number)[],
    problems: { path: (string | number)[]; message: string }[],
  ): void {
    const source = this.source(file);
    for (const p of problems)
      this.diagnostics.push(source.diagnostic([...at, ...p.path], p.message));
  }
}
