import { formatDiagnostic, hasErrors, loadProject } from '@trayful/formats';

const HELP = `Usage: trayful <command> [options]

Commands:
  validate <project-dir>   Check a project folder and report problems with file and line.
                           Add --json for machine-readable output.
  help                     Show this message.
`;

/** Runs the CLI and returns the process exit code. */
export async function run(args: string[], out = console.log, err = console.error): Promise<number> {
  const [command, ...rest] = args;
  switch (command) {
    case 'validate':
      return validate(rest, out, err);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      out(HELP);
      return 0;
    default:
      err(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

async function validate(
  args: string[],
  out: (s: string) => void,
  err: (s: string) => void,
): Promise<number> {
  const json = args.includes('--json');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    err('Usage: trayful validate <project-dir> [--json]');
    return 2;
  }
  const { project, diagnostics } = await loadProject(dir);
  if (json) {
    out(JSON.stringify({ ok: !hasErrors(diagnostics), diagnostics }, null, 2));
    return hasErrors(diagnostics) ? 1 : 0;
  }
  for (const d of diagnostics) (d.severity === 'error' ? err : out)(formatDiagnostic(d));
  if (!project) {
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    err(`\n${errors} ${errors === 1 ? 'error' : 'errors'} in ${dir}`);
    return 1;
  }
  const decks = Object.keys(project.decks).length;
  const setups = Object.keys(project.setups).length;
  out(
    `✓ ${project.manifest.name}: ${Object.keys(project.types).length} types, ` +
      `${project.components.length} components, ${decks} ${decks === 1 ? 'deck' : 'decks'}, ` +
      `${setups} ${setups === 1 ? 'setup' : 'setups'}`,
  );
  return 0;
}
