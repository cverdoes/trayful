import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
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
