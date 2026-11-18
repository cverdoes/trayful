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

  registerBranchTools(server, link);

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

const branchName = z
  .string()
  .describe('Branch name: letters, digits, dashes, dots and slashes, such as `deck-v2`.');

/** Branches for experiments, and committing saved tables. */
function registerBranchTools(server: McpServer, link: GitLink): void {
  server.registerTool(
    'list_branches',
    {
      title: 'List branches',
      description: "The repository's branches, and the one Trayful works on.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const branches = await link.repository.branches();
        return text(JSON.stringify({ current: link.repository.settings?.branch, branches }));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'create_branch',
    {
      title: 'Start a branch',
      description:
        'Sync, then start a new branch from where Trayful is, push it, and work on it from now on: for an experiment, such as a second version of a deck. The branch Trayful was on keeps its state.',
      inputSchema: { name: branchName },
    },
    async ({ name }) => {
      try {
        await link.repository.createBranch(name);
        return text(`Trayful now works on the new branch ${name}, pushed to the repository.`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'switch_branch',
    {
      title: 'Switch branch',
      description:
        "Sync, then work on another of the repository's branches from now on. The project files change to that branch's, and open tables reload.",
      inputSchema: { name: branchName },
    },
    async ({ name }) => {
      try {
        await link.repository.switchBranch(name);
        return text(`Trayful now works on ${name}.`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'snapshot_tables',
    {
      title: 'Commit the saved tables',
      description:
        "Commit and push the saved tables (tables/) as they are now, such as the position at the end of a playtest. Syncs leave them out because they change on every move. Does nothing if the repository's .gitignore keeps them out.",
      inputSchema: {
        message: z.string().optional().describe('Commit message, such as "End of playtest 3".'),
      },
    },
    async ({ message }) => {
      try {
        const committed = await link.snapshotTables(message);
        return text(
          committed
            ? 'Committed and pushed the saved tables.'
            : "No saved table had changed, or the repository's .gitignore keeps tables/ out.",
        );
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
