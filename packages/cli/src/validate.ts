import { formatDiagnostic, hasErrors, loadProject, type ResolvedProject } from '@trayful/formats';
import { UsageError } from './errors.js';

/** `trayful validate`: reports a project's problems with file and line. */
export async function validate(
  args: string[],
  out: (s: string) => void,
  err: (s: string) => void,
): Promise<number> {
  const json = args.includes('--json');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) throw new UsageError('Give the project folder to check.');
  const { project, diagnostics } = await loadProject(dir);
  if (json) {
    out(JSON.stringify({ ok: !hasErrors(diagnostics), diagnostics }, null, 2));
    return hasErrors(diagnostics) ? 1 : 0;
  }
  for (const d of diagnostics) (d.severity === 'error' ? err : out)(formatDiagnostic(d));
  if (!project) {
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    err(`\n${plural(errors, 'error')} in ${dir}`);
    return 1;
  }
  out(`✓ ${project.manifest.name}: ${contents(project)}`);
  return 0;
}

function contents(project: ResolvedProject): string {
  return [
    plural(Object.keys(project.types).length, 'type'),
    plural(project.components.length, 'component'),
    plural(Object.keys(project.decks).length, 'deck'),
    plural(Object.keys(project.setups).length, 'setup'),
  ].join(', ');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
