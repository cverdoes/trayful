/**
 * The ways in from outside: MCP tools, HTTP routes, CLI commands and the file format
 * reference. MCP tools and CLI help come from running the real code in-process, so a
 * new tool or command shows up without touching the generator.
 */
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, Workspace } from '@trayful/server';
import { run } from 'trayful';
import ts from 'typescript';
import { ROOT } from './config.js';
import type { CliCommand, Member, ModuleInfo, McpTool, ReferencePage, Route } from './model.js';

interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

/** A short, readable type for a JSON Schema: `string`, `"up" | "down"`, `object[]`. */
function schemaType(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (schema.anyOf) return [...new Set(schema.anyOf.map(schemaType))].join(' | ');
  if (schema.type === 'array') return `${schema.items ? schemaType(schema.items) : 'unknown'}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  return schema.type ?? 'unknown';
}

/** Which file registers each tool, from the source: `registerTool('name', …)`. */
async function toolGroups(): Promise<Map<string, string>> {
  const dir = path.join(ROOT, 'packages/server/src');
  const groups = new Map<string, string>();
  for (const file of await readdir(dir, { recursive: true })) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const text = await readFile(path.join(dir, file), 'utf8');
    for (const match of text.matchAll(/registerTool\(\s*'([a-z_]+)'/g)) {
      groups.set(match[1]!, `server/${file.split(path.sep).join('/')}`);
    }
  }
  return groups;
}

/** Lists the tools of a real MCP server over an in-memory connection. */
export async function readTools(): Promise<McpTool[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-overview-'));
  const example = path.join(ROOT, 'examples/harvest-moon');
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  const workspace = await Workspace.open(dir, { setup: false, watch: false });
  try {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    const client = new Client({ name: 'trayful-overview', version: '0' });
    await client.connect(b);
    const groups = await toolGroups();
    const { tools } = await client.listTools();
    await client.close();
    return tools.map((tool) => {
      const schema = tool.inputSchema as JsonSchema;
      const required = new Set(schema.required ?? []);
      const inputs: Member[] = Object.entries(schema.properties ?? {}).map(([name, s]) => ({
        name,
        type: schemaType(s),
        optional: !required.has(name),
        doc: s.description,
      }));
      return {
        name: tool.name,
        title: tool.title,
        description: tool.description ?? '',
        group: groups.get(tool.name) ?? 'server',
        inputs,
      };
    });
  } finally {
    await workspace.close();
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The CLI's commands, from its own help text: a line indented by two spaces starts a
 * command (its usage, then its description after a wider gap), and the lines after it
 * belong to it.
 */
export async function readCli(): Promise<CliCommand[]> {
  let help = '';
  await run(['help'], (text: string) => (help += text));
  const commands: CliCommand[] = [];
  for (const line of help.split('\n')) {
    const start = /^ {2}([a-z]+)\b(.*)$/.exec(line);
    if (start) {
      const [usage, ...text] = start[2]!.trim().split(/\s{2,}/);
      const name = start[1]!;
      commands.push({ name, usage: `trayful ${name} ${usage ?? ''}`.trim(), text: text.join(' ') });
    } else if (commands.length > 0 && line.trim()) {
      commands.at(-1)!.text += `\n${line.trim()}`;
    }
  }
  return commands.map((c) => ({ ...c, text: c.text.trim() }));
}

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** HTTP routes, from `app.get('/path', …)` calls in the server's route modules. */
export async function readRoutes(modules: ModuleInfo[]): Promise<Route[]> {
  const routes: Route[] = [];
  for (const m of modules.filter((mod) => mod.id.startsWith('server/routes/'))) {
    const text = await readFile(path.join(ROOT, m.path), 'utf8');
    const file = ts.createSourceFile(m.path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      const route = routeAt(node, file);
      if (route) {
        const owner = m.decls.filter((d) => d.kind === 'function' && d.line <= route.line).at(-1);
        routes.push({ ...route, module: m.id, doc: owner?.summary });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return routes;
}

function routeAt(node: ts.Node, file: ts.SourceFile) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
  const method = node.expression.name.text;
  const first = node.arguments[0];
  if (!METHODS.has(method) || node.expression.expression.getText(file) !== 'app') return;
  if (!first || !ts.isStringLiteral(first)) return;
  const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  return { method: method.toUpperCase(), path: first.text, line };
}

/** The format reference pages in `docs/reference/`, generated from the schemas. */
export async function readReference(): Promise<ReferencePage[]> {
  const dir = path.join(ROOT, 'docs/reference');
  const pages: ReferencePage[] = [];
  for (const file of (await readdir(dir))
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))) {
    const markdown = await readFile(path.join(dir, file), 'utf8');
    const title = /^# (.+)$/m.exec(markdown)?.[1] ?? file;
    pages.push({ slug: file.replace(/\.md$/, ''), title, markdown });
  }
  return pages;
}
