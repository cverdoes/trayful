import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMcpServer } from '../../src/mcp/server.js';
import { SKILLS_EXTENSION, SKILL_URI } from '../../src/mcp/skills.js';
import { Workspace } from '../../src/projects/workspace.js';
import { resourceDir } from '../../src/shipped/resources.js';
import { examplePath } from '../paths.js';

const File = z.object({ uri: z.string(), digest: z.string(), size: z.number() });
const Entry = z.object({
  uri: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  resources: z.array(File),
});
const Listing = z.looseObject({
  resultType: z.literal('complete'),
  skills: z.array(Entry),
  ttlMs: z.number(),
  cacheScope: z.string(),
});
const Got = z.looseObject({ resultType: z.literal('complete'), skill: Entry, ttlMs: z.number() });

const sha256 = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

describe('the skill over MCP', () => {
  let workspace: Workspace;
  let client: Client;

  beforeAll(async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-skills-')), 'game');
    await cp(examplePath('harvest-moon'), dir, {
      recursive: true,
      filter: (src) => path.basename(src) !== 'tables',
    });
    workspace = await Workspace.open(dir, { setup: false, watch: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterAll(() => workspace.close());

  it('declares the skills extension', () => {
    expect(client.getServerCapabilities()?.extensions).toHaveProperty([SKILLS_EXTENSION]);
  });

  it('lists the skill with its frontmatter and every file, digests matching the files', async () => {
    const listing = await client.request({ method: 'skills/list', params: {} }, Listing);
    expect(listing.cacheScope).toBe('public');
    expect(listing.skills).toHaveLength(1);
    const [skill] = listing.skills;
    expect(skill!.uri).toBe(SKILL_URI);
    expect(skill!.frontmatter.name).toBe('trayful');
    expect(skill!.frontmatter.description).toMatch(/Trayful/);
    expect(skill!.resources.map((r) => r.uri)).toEqual([
      'skill://trayful/SKILL.md',
      'skill://trayful/recipes.md',
    ]);
    for (const file of skill!.resources) {
      const bytes = await readFile(path.join(resourceDir('skill'), file.uri.split('/').pop()!));
      expect(file).toEqual({ uri: file.uri, digest: sha256(bytes), size: bytes.byteLength });
    }
  });

  it('gets the skill by its URI, and refuses others', async () => {
    const got = await client.request({ method: 'skills/get', params: { uri: SKILL_URI } }, Got);
    expect(got.skill.frontmatter.name).toBe('trayful');
    await expect(
      client.request({ method: 'skills/get', params: { uri: 'skill://other/SKILL.md' } }, Got),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
  });

  it('serves each file as a resource, listed for clients without the extension', async () => {
    const { resources } = await client.listResources();
    expect(resources.filter((r) => r.uri.startsWith('skill://')).map((r) => r.uri)).toEqual([
      'skill://trayful/SKILL.md',
      'skill://trayful/recipes.md',
    ]);
    const read = await client.readResource({ uri: SKILL_URI });
    expect(read.contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    expect(read.contents[0]).toHaveProperty('text', expect.stringMatching(/^---\nname: trayful\n/));
  });

  it('serves no file outside the skill', async () => {
    await expect(
      client.readResource({ uri: 'skill://trayful/../../package.json' }),
    ).rejects.toThrow();
    await expect(client.readResource({ uri: 'skill://trayful/missing.md' })).rejects.toThrow(
      /No skill file/,
    );
  });

  it('points agents to the skill in the server instructions', () => {
    expect(client.getInstructions()).toContain(SKILL_URI);
  });
});
