import path from 'node:path';
import { installSkill } from '@trayful/server';

/** `trayful skill`: copies the agent skill into a repository for Claude Code to use. */
export async function skill(args: string[], out: (s: string) => void): Promise<number> {
  const repository = args.find((a) => !a.startsWith('--')) ?? '.';
  const result = await installSkill(path.resolve(repository));
  out(
    `${result.updated ? 'Updated' : 'Added'} the Trayful skill in ${path.relative(process.cwd(), result.dir)}. ` +
      'Claude Code uses it in this repository from its next session. Run this again after updating Trayful.',
  );
  return 0;
}
