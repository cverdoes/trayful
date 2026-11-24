// Asks before Trayful serves a busy folder it has not served before, such as the home folder.
import { createInterface } from 'node:readline/promises';
import { markBase, projectDirs, resolveBase, otherFilesIn, type BaseFolder } from '@trayful/server';
import { CliError } from './errors.js';

/** Asks the person a yes-or-no question. */
export type Confirm = (question: string) => Promise<boolean>;

/**
 * The base folder for `dir`, once it is fine to serve. A folder that holds more than
 * projects and has no `.trayful` folder yet is asked about first: Trayful lists every
 * project in it and keeps its own files there. A yes marks the folder, so it asks once.
 */
export async function checkedBase(
  dir: string,
  project: string | undefined,
  // Without `confirm` nobody can answer, such as in CI.
  { yes, confirm }: { yes: boolean; confirm: Confirm | undefined },
): Promise<BaseFolder> {
  const start = resolveBase(dir, project);
  const others = await otherFilesIn(start.base);
  // With no project in it, starting fails anyway, and says why.
  if (others === 0 || yes || (await projectDirs(start.base)).length === 0) return start;
  const question = `${start.base} holds ${others} other ${others === 1 ? 'file or folder' : 'files and folders'} besides Trayful projects. Use it as the folder for your projects? Trayful keeps its own files in .trayful there.`;
  if (!confirm) {
    throw new CliError(
      `${question}\nRun trayful play there once to answer, or add --yes. To keep projects apart, put them in a folder of their own.`,
    );
  }
  if (!(await confirm(question))) throw new CliError('Stopped; nothing was changed.');
  await markBase(start.base);
  return start;
}

/** Asks on the terminal, if there is one to ask on. */
export function terminalConfirm(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Confirm | undefined {
  if (!input.isTTY || !output.isTTY) return undefined;
  return async (question) => {
    const terminal = createInterface({ input, output });
    try {
      return /^y(es)?$/i.test((await terminal.question(`${question} [y/N] `)).trim());
    } finally {
      terminal.close();
    }
  };
}
