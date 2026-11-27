import { existsSync } from 'node:fs';
import { cp, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resourceDir } from './resources.js';

/** Where Claude Code looks for a repository's skills, from the repository's root. */
const SKILL_FOLDER = path.join('.claude', 'skills', 'trayful');

export interface InstalledSkill {
  /** The folder the skill was written to. */
  dir: string;
  /** Whether an earlier copy was there, and has been brought up to date. */
  updated: boolean;
}

/**
 * Copies the agent skill for working with Trayful over MCP into a repository, as
 * `.claude/skills/trayful/`. The files Trayful ships replace earlier copies of
 * themselves; files someone added beside them stay.
 */
export async function installSkill(repository: string): Promise<InstalledSkill> {
  const dir = path.join(repository, SKILL_FOLDER);
  const updated = existsSync(dir);
  await cp(resourceDir('skill'), dir, { recursive: true, force: true });
  return { dir, updated };
}

/**
 * The skill's files, as `/`-separated paths from its folder, SKILL.md first. These
 * are the files `installSkill` copies and the MCP server serves.
 */
export async function skillFiles(): Promise<string[]> {
  const dir = resourceDir('skill');
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort((a, b) => Number(b === 'SKILL.md') - Number(a === 'SKILL.md') || a.localeCompare(b));
}

/** One file of the skill, by a path `skillFiles` gave. */
export async function readSkillFile(file: string): Promise<Buffer> {
  return readFile(path.join(resourceDir('skill'), file));
}
