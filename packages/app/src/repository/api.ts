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
}

async function send(route: string, body?: object): Promise<RepositoryStatus> {
  const response = await fetch(route, {
    method: body ? 'POST' : 'GET',
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const result = (await response.json()) as RepositoryStatus & { error?: string };
  if (!response.ok) throw new Error(result.error ?? response.statusText);
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

/** Whether the server is up but has no project yet, waiting for a repository. */
export async function waitingForRepository(): Promise<boolean> {
  try {
    const health = (await (await fetch('/api/health')).json()) as { waiting?: boolean };
    return health.waiting === true;
  } catch {
    return false;
  }
}
