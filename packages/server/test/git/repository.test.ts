import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitError } from '../../src/git/git.js';
import { FreshError, Repository } from '../../src/git/repository.js';
import { makeRemote, pushFromLaptop, sh, type Remote } from './remote.js';

async function connected(
  remote: Remote,
  input: { branch?: string; path?: string; create?: boolean } = {},
) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
  const repository = await Repository.open({ dataDir, allowLocalUrls: true });
  await repository.connect({ url: remote.url, path: 'prototype', ...input });
  return repository;
}

function manifest(repository: Repository): string {
  return path.join(repository.projectRoot, 'trayful.yaml');
}

describe('Repository', () => {
  it('clones the branch and finds the project in its folder', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    expect(existsSync(manifest(repository))).toBe(true);
    // Only the folder is checked out, and the files at the top.
    expect(existsSync(path.join(repository.cloneDir, 'README.md'))).toBe(true);
    const status = await repository.status();
    expect(status).toMatchObject({
      connected: true,
      branch: 'main',
      path: 'prototype',
      unpushed: 0,
    });
    expect(status.changed).toEqual([]);
  });

  it('remembers the connection in the data folder', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    const dataDir = path.dirname(repository.cloneDir);
    const again = await Repository.open({ dataDir, allowLocalUrls: true });
    expect(again.settings).toEqual({ url: remote.url, branch: 'main', path: 'prototype' });
    await expect(again.connect({ url: remote.url })).rejects.toThrow(/already connected/);
  });

  it('asks before making a branch or a project that is not there yet', async () => {
    const remote = await makeRemote();
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
    const repository = await Repository.open({ dataDir, allowLocalUrls: true });
    const typo = repository.connect({ url: remote.url, branch: 'mian', path: 'prototypes' });
    await expect(typo).rejects.toThrow(FreshError);
    await expect(typo).rejects.toMatchObject({ fresh: { branch: 'mian', folder: 'prototypes' } });
    // Nothing was kept or pushed, and the right settings still connect.
    expect(existsSync(repository.cloneDir)).toBe(false);
    expect(sh(remote.root, '--git-dir', 'game.git', 'branch', '--list', 'mian')).toBe('');
    await repository.connect({ url: remote.url, path: 'prototype' });
    expect(existsSync(manifest(repository))).toBe(true);
  });

  it('starts a project in an empty repository and pushes it to a new branch', async () => {
    const remote = await makeRemote({ empty: true });
    const repository = await connected(remote, {
      branch: 'prototype',
      path: 'my-game',
      create: true,
    });
    expect(existsSync(manifest(repository))).toBe(true);
    expect(await readFile(manifest(repository), 'utf8')).toContain('name: "My game"');
    expect(sh(remote.root, '--git-dir', 'game.git', 'log', '--format=%s', 'prototype')).toContain(
      'Trayful: start a prototype',
    );
  });

  it('commits and pushes changes made here, leaving saved tables out', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# edited\n',
    );
    await mkdir(path.join(repository.projectRoot, 'tables'), { recursive: true });
    await writeFile(path.join(repository.projectRoot, 'tables', 'table-1.json'), '{}');
    expect((await repository.status()).changed).toEqual(['prototype/trayful.yaml']);
    const result = await repository.sync('Trayful: edit the manifest');
    expect(result).toMatchObject({ committed: true, pushed: true, pulled: false });
    sh(remote.laptop, 'pull', '--quiet', 'origin', 'main');
    expect(await readFile(path.join(remote.laptop, 'prototype', 'trayful.yaml'), 'utf8')).toContain(
      '# edited',
    );
    expect(existsSync(path.join(remote.laptop, 'prototype', 'tables', 'table-1.json'))).toBe(false);
  });

  it('takes in commits pushed elsewhere and says the files changed', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    let changes = 0;
    repository.onChange(() => {
      changes++;
      return Promise.resolve();
    });
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t + '# from the laptop\n');
    expect(await repository.sync()).toMatchObject({ pulled: true, pushed: false });
    expect(await readFile(manifest(repository), 'utf8')).toContain('# from the laptop');
    expect(changes).toBe(1);
  });

  it('merges when both sides changed different files', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await pushFromLaptop(remote, 'README.md', (t) => t + 'More rules.\n');
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# here\n',
    );
    expect(await repository.sync()).toMatchObject({ committed: true, pulled: true, pushed: true });
    sh(remote.laptop, 'pull', '--quiet', 'origin', 'main');
    expect(await readFile(path.join(remote.laptop, 'prototype', 'trayful.yaml'), 'utf8')).toContain(
      '# here',
    );
  });

  it('puts its side of a conflict on a branch of its own, and can give it up', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t + '# laptop\n');
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# trayful\n',
    );
    const result = await repository.sync();
    expect(result.pushed).toBe(false);
    expect(result.conflict?.files).toEqual(['prototype/trayful.yaml']);
    const side = result.conflict!.branch;
    expect(side).toMatch(/^trayful\/conflict-\d{8}-\d{4}$/);
    // The project folder is left as it was, with no conflict markers in it.
    expect(await readFile(manifest(repository), 'utf8')).toContain('# trayful');
    expect(await readFile(manifest(repository), 'utf8')).not.toContain('<<<<');
    expect((await repository.status()).conflict?.branch).toBe(side);

    await repository.takeTheirs();
    expect(await readFile(manifest(repository), 'utf8')).toContain('# laptop');
    expect((await repository.status()).conflict).toBeUndefined();
    const kept = sh(remote.root, '--git-dir', 'game.git', 'show', `${side}:prototype/trayful.yaml`);
    expect(kept).toContain('# trayful');
  });

  it('clears the conflict once the branch has taken in its side', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t + '# laptop\n');
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# trayful\n',
    );
    const { conflict } = await repository.sync();
    // Someone resolves it on their computer and pushes the result.
    sh(remote.laptop, 'fetch', '--quiet', 'origin', conflict!.branch);
    sh(remote.laptop, 'merge', '--quiet', '-X', 'ours', '-m', 'Resolve', 'FETCH_HEAD');
    sh(remote.laptop, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
    expect(await repository.sync()).toMatchObject({ pulled: true });
    expect((await repository.status()).conflict).toBeUndefined();
  });

  it('refuses addresses that could reach the server itself', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
    const repository = await Repository.open({ dataDir });
    await expect(repository.connect({ url: 'file:///etc' })).rejects.toThrow(GitError);
    await expect(repository.connect({ url: 'https://me:pw@github.com/x/y' })).rejects.toThrow(
      /without a password/,
    );
    await expect(repository.sync()).rejects.toThrow(/No repository/);
    expect((await repository.status()).connected).toBe(false);
  });

  it('cleans up after a clone that failed', async () => {
    const remote = await makeRemote();
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
    const repository = await Repository.open({ dataDir, allowLocalUrls: true });
    await expect(repository.connect({ url: `${remote.url}-missing` })).rejects.toThrow(
      /clone failed/,
    );
    expect(existsSync(repository.cloneDir)).toBe(false);
    expect(repository.settings).toBeUndefined();
  });

  it('starts a branch for an experiment, and moves between branches', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    let changes = 0;
    repository.onChange(() => {
      changes++;
      return Promise.resolve();
    });
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# main\n',
    );
    await repository.createBranch('deck-v2');
    expect(repository.settings?.branch).toBe('deck-v2');
    expect(await repository.branches()).toEqual(['deck-v2', 'main']);
    // What changed before the branch went to the branch it was on.
    expect(
      sh(remote.root, '--git-dir', 'game.git', 'show', 'main:prototype/trayful.yaml'),
    ).toContain('# main');
    await writeFile(
      manifest(repository),
      (await readFile(manifest(repository), 'utf8')) + '# v2\n',
    );
    await repository.switchBranch('main');
    expect(await readFile(manifest(repository), 'utf8')).not.toContain('# v2');
    expect(changes).toBe(1);
    expect(
      sh(remote.root, '--git-dir', 'game.git', 'show', 'deck-v2:prototype/trayful.yaml'),
    ).toContain('# v2');
    // The data folder remembers the branch.
    const again = await Repository.open({ dataDir: path.dirname(repository.cloneDir) });
    expect(again.settings?.branch).toBe('main');
  });

  it('refuses branches it cannot start or find', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await expect(repository.createBranch('main')).rejects.toThrow(/already has a branch "main"/);
    await expect(repository.switchBranch('nowhere')).rejects.toThrow(/no branch "nowhere"/);
    await expect(repository.createBranch('-x')).rejects.toThrow(/not a usable branch name/);
  });

  it('commits the saved tables only when asked', async () => {
    const remote = await makeRemote();
    // The starter keeps tables out of git; this game wants them in.
    await pushFromLaptop(remote, 'prototype/.gitignore', (t) => t.replace('tables/\n', ''));
    const repository = await connected(remote);
    expect(await repository.snapshotTables()).toBe(false);
    await mkdir(path.join(repository.projectRoot, 'tables'), { recursive: true });
    await writeFile(path.join(repository.projectRoot, 'tables', 'table-1.json'), '{}\n');
    expect(await repository.snapshotTables('End of playtest 1')).toBe(true);
    sh(remote.laptop, 'pull', '--quiet', 'origin', 'main');
    expect(sh(remote.laptop, 'log', '-1', '--format=%s')).toContain('End of playtest 1');
    expect(existsSync(path.join(remote.laptop, 'prototype', 'tables', 'table-1.json'))).toBe(true);
  });

  it('leaves tables out that the repository ignores, as the starter does', async () => {
    const remote = await makeRemote();
    const repository = await connected(remote);
    await mkdir(path.join(repository.projectRoot, 'tables'), { recursive: true });
    await writeFile(path.join(repository.projectRoot, 'tables', 'table-1.json'), '{}\n');
    expect(await repository.snapshotTables()).toBe(false);
  });
});
