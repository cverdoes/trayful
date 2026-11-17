import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GitLink } from '../git/link.js';
import type { SyncResult } from '../git/sync.js';
import { failure, text } from './context.js';

/**
 * Tools for a git-backed Trayful: connecting a repository, syncing with it and
 * resolving a conflict. Only offered when Trayful was started with a data folder.
 */
export function registerRepositoryTools(server: McpServer, link: GitLink): void {
  server.registerTool(
    'repository_status',
    {
      title: 'Repository status',
      description:
        'The repository, branch and folder Trayful works on; commits not pushed yet; commits on the branch not taken in yet; files changed and not committed; the last sync and any conflict.',
      annotations: { readOnlyHint: true },
    },
    async () => text(JSON.stringify(await link.status())),
  );

  server.registerTool(
    'connect_repository',
    {
      title: 'Connect a repository',
      description:
        'Point a Trayful that has no project yet at a git repository. Trayful clones it, checks out the branch, and opens the project in the folder. A branch that does not exist yet, or a folder with no project, fails with what is missing; check with the user that it is not a typo, then call again with `create: true` to make the branch, or start the folder from the starter, committed and pushed.',
      inputSchema: {
        url: z
          .string()
          .describe('https:// address such as https://github.com/me/my-game, or an SSH address.'),
        branch: z.string().optional().describe('Branch to work on. Default `main`.'),
        path: z
          .string()
          .optional()
          .describe(
            'Folder in the repository with the project, such as `prototype`. Default: the top.',
          ),
        create: z
          .boolean()
          .optional()
          .describe('Make the branch, or a starter project in the folder, if missing.'),
      },
    },
    async (input) => {
      try {
        return text(JSON.stringify(await link.connect(input)));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'sync_repository',
    {
      title: 'Sync with the repository',
      description:
        "Commit what changed here (saved tables left out), take in the branch's new commits, and push. Call it after you push to the repository, so Trayful shows your changes, and before you pull, so the repository has Trayful's. Open tables reload when files change.",
      inputSchema: {
        message: z.string().optional().describe('Commit message for changes made here.'),
      },
    },
    async ({ message }) => {
      try {
        return text(describeSync(await link.sync(message)));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'resolve_conflict',
    {
      title: 'Resolve a conflict',
      description:
        "After a sync found that the repository and Trayful changed the same lines: take the repository's version. Trayful's side stays on its conflict branch, so nothing is lost. To keep Trayful's side instead, merge its conflict branch on your computer, push, and sync.",
    },
    async () => {
      try {
        return text(describeSync(await link.repository.takeTheirs()));
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** What a sync did, in words. */
function describeSync(result: SyncResult): string {
  if (result.conflict) {
    return [
      `Conflict: the repository and Trayful both changed ${result.conflict.files.join(', ')}.`,
      `Trayful's side is on the branch ${result.conflict.branch}; the project here is unchanged.`,
      "Merge that branch on your computer and push, then sync again; or resolve_conflict to take the repository's version.",
    ].join(' ');
  }
  const done = [
    result.committed ? 'committed the changes made here' : '',
    result.pulled ? 'took in new commits, so the project reloaded' : '',
    result.pushed ? 'pushed' : '',
  ].filter(Boolean);
  return done.length ? `Synced: ${done.join(', ')}.` : 'Already in sync.';
}
