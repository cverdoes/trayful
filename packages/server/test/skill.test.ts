import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDoc } from './docs.js';
import { createMcpServer } from './mcp.js';
import { resourceDir } from './resources.js';
import { Workspace } from './workspace.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const skillDir = resourceDir('skill');
const read = (file: string) => readFile(path.join(skillDir, file), 'utf8');
const matches = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[1]!);

/** Keeps the agent skill true to the MCP server it describes. */
describe('the agent skill', () => {
  let workspace: Workspace;
  let tools: string[];
  let skill: string;
  let pages: string;

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-skill-'));
    await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
    workspace = await Workspace.open(dir, { setup: false, watch: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
    tools = (await client.listTools()).tools.map((t) => t.name);
    skill = await read('SKILL.md');
    pages = [skill, await read('recipes.md')].join('\n');
  });
  afterAll(() => workspace.close());

  it('says who it is and when to use it', () => {
    expect(skill).toMatch(/^---\nname: trayful\ndescription: \S.*\n---\n/);
  });

  it('mentions every tool', () => {
    const named = new Set(matches(skill, /`([a-z_]+)`/g));
    expect(tools.filter((t) => !named.has(t))).toEqual([]);
  });

  it('names only tools that exist', () => {
    const named = matches(pages, /`([a-z]+(?:_[a-z]+)+)`/g);
    expect(named.filter((t) => !tools.includes(t))).toEqual([]);
  });

  it('points only to docs and files that exist', async () => {
    for (const doc of matches(pages, /trayful:\/\/docs\/([\w/.-]+\.md)/g)) {
      await expect(readDoc(doc)).resolves.toBeTruthy();
    }
    for (const link of matches(pages, /\]\(([\w/.-]+\.md)\)/g)) {
      expect(existsSync(path.join(skillDir, link)), link).toBe(true);
    }
  });
});
