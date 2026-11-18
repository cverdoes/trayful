// A git-backed Trayful in the browser: connecting it to a repository, the branch chip, and settling a conflict.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createProjectFolder, Repository, startServer, type RunningServer } from '@trayful/server';

let server: RunningServer;
let laptop: string;
let url: string;

/** Runs git as someone at their computer. */
function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Someone',
      GIT_AUTHOR_EMAIL: 'someone@example.com',
      GIT_COMMITTER_NAME: 'Someone',
      GIT_COMMITTER_EMAIL: 'someone@example.com',
    },
  });
}

test.beforeAll(async () => {
  // A bare repository stands in for GitHub, with a prototype pushed from "the laptop".
  const root = await mkdtemp(path.join(tmpdir(), 'trayful-e2e-git-'));
  sh(root, 'init', '--quiet', '--bare', 'game.git');
  url = `file://${path.join(root, 'game.git')}`;
  laptop = path.join(root, 'laptop');
  sh(root, 'clone', '--quiet', url, laptop);
  await createProjectFolder(path.join(laptop, 'prototype'), 'Git Game');
  sh(laptop, 'add', '--all');
  sh(laptop, 'commit', '--quiet', '-m', 'A prototype');
  sh(laptop, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');

  const dataDir = path.join(root, 'data');
  const repository = await Repository.open({ dataDir, allowLocalUrls: true });
  server = await startServer({ repository, port: 0, syncTimes: false });
});

test.afterAll(async () => {
  await server.close();
});

test('the host connects a repository, syncs, and settles a conflict', async ({ page }) => {
  await page.goto(server.url);
  await expect(page.getByRole('heading', { name: 'Connect a repository' })).toBeVisible();
  await page.getByLabel('Repository').fill(url);
  // A typo in the folder is caught before Trayful starts a project there.
  await page.getByLabel('Folder').fill('protoype');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('There is no Trayful project in protoype yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create and connect' })).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByLabel('Folder').fill('prototype');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(page.locator('.toolbar strong').first()).toHaveText('Git Game');
  const chip = page.getByRole('button', { name: /^Repository: main, In sync/ });
  await expect(chip).toBeVisible();

  // Both sides change the same line of the manifest.
  const manifest = path.join(server.git!.repository.projectRoot, 'prototype', 'trayful.yaml');
  await writeFile(manifest, (await readFile(manifest, 'utf8')) + '# trayful\n');
  const onLaptop = path.join(laptop, 'prototype', 'trayful.yaml');
  await writeFile(onLaptop, (await readFile(onLaptop, 'utf8')) + '# laptop\n');
  sh(laptop, 'commit', '--quiet', '-am', 'Edit on the laptop');
  sh(laptop, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');

  await chip.click();
  await page.getByRole('menuitem', { name: /Sync now/ }).click();
  const banner = page.locator('.repository-conflict');
  await expect(banner).toContainText('both changed prototype/trayful.yaml');
  await expect(banner).toContainText('trayful/conflict-');

  await banner.getByRole('button', { name: "Take the repository's version" }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole('button', { name: /^Repository: main, In sync/ })).toBeVisible();
  expect(await readFile(manifest, 'utf8')).toContain('# laptop');

  // An experiment on a branch of its own, then back.
  await page.getByRole('button', { name: /^Repository: main/ }).click();
  await page.getByRole('menuitem', { name: /New branch/ }).click();
  await page.getByLabel('Branch name').fill('deck-v2');
  await page.getByRole('button', { name: 'Start branch' }).click();
  await expect(page.getByRole('button', { name: /^Repository: deck-v2, In sync/ })).toBeVisible();
  expect(sh(laptop, 'ls-remote', '--heads', 'origin')).toContain('refs/heads/deck-v2');

  await page.getByRole('button', { name: /^Repository: deck-v2/ }).click();
  await page.getByRole('menuitem', { name: /Switch branch/ }).click();
  await expect(page.getByText(/Branches: deck-v2, main, trayful\/conflict-/)).toBeVisible();
  await page.getByLabel('Branch name').fill('main');
  await page.getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByRole('button', { name: /^Repository: main, In sync/ })).toBeVisible();
});
