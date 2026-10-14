import type { z } from 'zod';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  /** File path relative to the project folder. */
  file: string;
  /** 1-based line, when known. */
  line?: number;
  /** 1-based column, when known. */
  col?: number;
  /** Path inside the file's data, e.g. `["types", 0, "size"]`. */
  path?: (string | number)[];
  message: string;
}

/** A problem at a path inside a type or setup step, before it is placed in its file. */
export interface Problem {
  path: (string | number)[];
  message: string;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.line ? `${d.file}:${d.line}:${d.col ?? 1}` : d.file;
  const at = d.path && d.path.length > 0 ? ` (at ${formatPath(d.path)})` : '';
  return `${where}  ${d.severity}  ${d.message}${at}`;
}

export function formatPath(path: (string | number)[]): string {
  return path.map((p, i) => formatPathPart(p, i === 0)).join('');
}

function formatPathPart(part: string | number, first: boolean): string {
  if (typeof part === 'number') return `[${part}]`;
  return first ? part : `.${part}`;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

type Issue = z.core.$ZodIssue;

/**
 * Flattens zod issues into `{ path, message }` pairs. Union failures are
 * narrowed to the branch that matches the input's shape best, so an author sees
 * "text: expected string" instead of every branch's complaints.
 */
export function flattenIssues(
  issues: readonly Issue[],
  base: (string | number)[] = [],
): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  for (const issue of issues) {
    const path = [...base, ...(issue.path as (string | number)[])];
    if (issue.code === 'invalid_union' && issue.errors.length > 0) {
      const best = pickBranch(issue.errors);
      out.push(...flattenIssues(best, path));
      continue;
    }
    // Point unknown keys at the key itself so the line number lands on the typo.
    if (issue.code === 'unrecognized_keys' && issue.keys.length === 1) path.push(issue.keys[0]!);
    out.push({ path, message: friendlyMessage(issue) });
  }
  return out;
}

function pickBranch(branches: Issue[][]): Issue[] {
  let best = branches[0] ?? [];
  let bestScore = Infinity;
  for (const branch of branches) {
    // A branch is a poor match when the input lacks its keys entirely or carries
    // keys it does not know: that means the author meant a different branch.
    const structural = branch.filter(
      (i) =>
        (i.code === 'unrecognized_keys' && i.path.length === 0) ||
        (i.code === 'invalid_type' && i.message.endsWith('received undefined')) ||
        (i.code === 'invalid_type' && i.path.length === 0),
    ).length;
    const score = structural * 1000 + branch.length;
    if (score < bestScore) {
      best = branch;
      bestScore = score;
    }
  }
  return best;
}

function friendlyMessage(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.message.endsWith('received undefined'))
        return `Missing required value (${issue.expected}).`;
      return issue.message.replace(/^Invalid input: /, '');
    case 'unrecognized_keys':
      return `Unknown ${issue.keys.length === 1 ? 'key' : 'keys'}: ${issue.keys.map((k) => `"${k}"`).join(', ')}.`;
    case 'invalid_value':
      return issue.message
        .replace(/^Invalid option: /, '')
        .replace(/^Invalid input: /, '')
        .replaceAll('"|"', '", "');
    default:
      return issue.message;
  }
}
