// The server's repository routes, for a git-backed Trayful: where things stand, connect, sync, resolve.

/** How Trayful and its repository stand, as the server reports it. */
export interface RepositoryStatus {
  connected: boolean;
  url?: string;
  branch?: string;
  path?: string;
  head?: string;
  /** Commits Trayful has made that the branch does not have yet. */
  unpushed: number;
  /** Commits on the branch Trayful has not taken in yet. */
  behind: number;
  /** Files changed and not committed yet. */
  changed: string[];
  lastSync?: string;
  lastError?: string;
  conflict?: { branch: string; files: string[] };
}

export interface ConnectInput {
  url: string;
  branch?: string;
  path?: string;
  /** Make the branch, or a starter project in the folder, if missing. */
  create?: boolean;
}

/** What connecting would make that the repository does not have yet. */
export interface Fresh {
  branch?: string;
  folder?: string;
}

/** A failed repository request; `fresh` when it only needs the person to confirm. */
export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly fresh?: Fresh,
  ) {
    super(message);
  }
}

async function send(route: string, body?: object): Promise<RepositoryStatus> {
  const response = await fetch(route, {
    method: body ? 'POST' : 'GET',
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const result = (await response.json()) as RepositoryStatus & { error?: string; fresh?: Fresh };
  if (!response.ok) throw new RepositoryError(result.error ?? response.statusText, result.fresh);
  return result;
}

/** Where things stand; undefined when this Trayful works on a folder, not a repository. */
export async function fetchStatus(): Promise<RepositoryStatus | undefined> {
  const response = await fetch('/api/repository');
  if (response.status === 404 || response.status === 403) return undefined;
  return (await response.json()) as RepositoryStatus;
}

export const connectRepository = (input: ConnectInput) => send('/api/repository/connect', input);
export const syncRepository = () => send('/api/repository/sync', {});
export const takeRepositoryVersion = () => send('/api/repository/resolve', {});
export const changeBranch = (name: string, create: boolean) =>
  send('/api/repository/branch', { name, create });
export const snapshotTables = () => send('/api/repository/snapshot', {});

/** The repository's branches. */
export async function fetchBranches(): Promise<string[]> {
  const response = await fetch('/api/repository/branches');
  const result = (await response.json()) as { branches?: string[]; error?: string };
  if (!response.ok) throw new Error(result.error ?? response.statusText);
  return result.branches ?? [];
}

/** Whether the server is up but has no project yet, waiting for a repository. */
export async function waitingForRepository(): Promise<boolean> {
  try {
    const health = (await (await fetch('/api/health')).json()) as { waiting?: boolean };
    return health.waiting === true;
  } catch {
    return false;
  }
}
