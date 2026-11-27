import { createHash } from 'node:crypto';
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { parse } from 'yaml';
import { z } from 'zod';
import { readSkillFile, skillFiles } from '../shipped/skill.js';

/** The MCP extension for serving skills (SEP-2640), as servers declare it. */
export const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

/** Where the skill lives; its last segment is the skill's `name`. */
const SKILL_ROOT = 'skill://trayful';
export const SKILL_URI = `${SKILL_ROOT}/SKILL.md`;

/**
 * How long clients may keep a listing. The skill only changes with a new version of
 * Trayful, and is the same for everyone who reaches this server.
 */
const FRESHNESS = { ttlMs: 60 * 60 * 1000, cacheScope: 'public' } as const;

const ListSkillsRequest = z.object({
  method: z.literal('skills/list'),
  params: z.looseObject({ cursor: z.string().optional() }).optional(),
});
const GetSkillRequest = z.object({
  method: z.literal('skills/get'),
  params: z.looseObject({ uri: z.string() }),
});

interface SkillFile {
  uri: string;
  digest: string;
  size: number;
}

/** One skill as `skills/list` and `skills/get` describe it. */
interface SkillEntry {
  uri: string;
  frontmatter: Record<string, unknown>;
  resources: SkillFile[];
}

/**
 * Serves the agent skill that `trayful skill` installs, over MCP: each file is a
 * `skill://trayful/...` resource, and clients that support the skills extension find
 * it through `skills/list`. The digests change whenever the files do, which is how
 * clients tell versions apart. Clients without the extension can still read the
 * resources, and the server instructions point to them.
 */
export function registerSkills(server: McpServer): void {
  server.server.registerCapabilities({ extensions: { [SKILLS_EXTENSION]: {} } });
  server.server.setRequestHandler(ListSkillsRequest, async () => ({
    resultType: 'complete',
    skills: [await skillEntry()],
    ...FRESHNESS,
  }));
  server.server.setRequestHandler(GetSkillRequest, async ({ params }) => {
    if (params.uri !== SKILL_URI) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No skill at ${params.uri}. Trayful serves one skill, ${SKILL_URI}.`,
      );
    }
    return { resultType: 'complete', skill: await skillEntry(), ...FRESHNESS };
  });
  server.registerResource(
    'skill',
    new ResourceTemplate(`${SKILL_ROOT}/{+file}`, {
      list: async () => ({
        resources: (await skillFiles()).map((file) => ({
          uri: `${SKILL_ROOT}/${file}`,
          name: file === 'SKILL.md' ? 'Trayful skill' : `Trayful skill: ${file}`,
          mimeType: mimeType(file),
        })),
      }),
    }),
    {
      title: 'Trayful skill',
      description:
        'How to design components and play on a Trayful table: start with skill://trayful/SKILL.md.',
    },
    async (uri, vars) => {
      const file = String(vars.file);
      if (!(await skillFiles()).includes(file)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No skill file at ${uri.href}. skills/list names every file of the skill.`,
        );
      }
      const text = (await readSkillFile(file)).toString('utf8');
      return { contents: [{ uri: uri.href, mimeType: mimeType(file), text }] };
    },
  );
}

/**
 * The skill's listing: its frontmatter, and every file with its digest and size. Read
 * afresh on each request (two small files) rather than kept in a module-level cache.
 */
async function skillEntry(): Promise<SkillEntry> {
  const files = await skillFiles();
  const contents = await Promise.all(files.map(readSkillFile));
  const main = contents[files.indexOf('SKILL.md')];
  if (!main) throw new McpError(ErrorCode.InternalError, 'The skill has no SKILL.md.');
  return {
    uri: SKILL_URI,
    frontmatter: frontmatter(main.toString('utf8')),
    resources: files.map((file, i) => ({
      uri: `${SKILL_ROOT}/${file}`,
      digest: `sha256:${createHash('sha256').update(contents[i]!).digest('hex')}`,
      size: contents[i]!.byteLength,
    })),
  };
}

/** The YAML between the `---` lines that open a SKILL.md. */
function frontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match ? (parse(match[1]!) as Record<string, unknown>) : {};
}

function mimeType(file: string): string {
  return file.endsWith('.md') ? 'text/markdown' : 'text/plain';
}
