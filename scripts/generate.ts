/**
 * Generates files derived from the format schemas:
 *   packages/formats/schema/<kind>.schema.json  JSON Schema for editors and tools
 *   docs/reference/<kind>.md                    the format reference
 *
 * Run `pnpm generate` after changing a schema. `pnpm check:generated` (used in CI)
 * fails when the committed files are out of date.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTable, toTableFile } from '@trayful/core';
import { loadProject, PRIMITIVE_INFO, toJsonSchemas, type FileKind } from '@trayful/formats';

const root = fileURLToPath(new URL('..', import.meta.url));
const example = 'examples/harvest-moon';

type Schema = {
  $ref?: string;
  $defs?: Record<string, Schema>;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  items?: Schema;
  prefixItems?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: Schema | boolean;
  description?: string;
  title?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  pattern?: string;
  default?: unknown;
};

const KINDS: { kind: FileKind; file: string; example?: string; intro: string }[] = [
  {
    kind: 'manifest',
    file: 'manifest.md',
    example: 'trayful.yaml',
    intro:
      'Every project folder has a `trayful.yaml` at its root. It names the prototype and says which files to load.',
  },
  {
    kind: 'library',
    file: 'library.md',
    example: 'library/cards.yaml',
    intro:
      'Library files define component types. A type picks a built-in primitive for its behaviour, gives a physical size in millimetres, declares data fields, and describes how each side looks as layers of shapes, text and images.',
  },
  {
    kind: 'inventory',
    file: 'inventory.md',
    example: 'inventory.yaml',
    intro:
      'The inventory lists what is in the box. Each entry names a type and how many components to make, with field values given inline, from a CSV file, or as combinations.\n\n' +
      'Each component gets a stable id built from its type, its row and its copy number, such as `action-card.harvest.2` (third segment only when `count` is above 1). The row part is the slugged `id` column when given, else the `name` field, else the first text field, else the row number. Saved tables refer to these ids, so renaming a card changes its id; add an `id` to the row to keep it.',
  },
  {
    kind: 'setup',
    file: 'setup.md',
    example: 'setups/2-player.yaml',
    intro:
      "Setups are scripted starting layouts in `setups/*.yaml`. A new table runs the setup named by the manifest's `setup` key; steps run in order, and anything they do not place is laid out in rows. See [Write a setup](../howto/write-a-setup.md) for a walkthrough and [Snapping](snapping.md) for how targets fill.",
  },
  {
    kind: 'table',
    file: 'table.md',
    intro:
      'Tables are saved as JSON in `tables/`. Trayful writes these files; they are documented here for tools and agents that read them. Positions are piece centres in millimetres.',
  },
];

/** Hand-written reference pages, listed in the generated index. */
const TOPICS = [
  {
    title: 'Units and coordinates',
    file: 'units-and-coordinates.md',
    about: 'Millimetres, where `[0, 0]` is, common sizes.',
  },
  {
    title: 'Faces and templates',
    file: 'faces-and-templates.md',
    about: 'Layers, `{{field}}` placeholders, `when`, colours and palettes.',
  },
  {
    title: 'Snapping',
    file: 'snapping.md',
    about: 'Snap targets, spot names, `accepts`, and what happens on drop.',
  },
  {
    title: 'Players and hands',
    file: 'players-and-hands.md',
    about: 'Private hands, `hand:<player>` targets, what each player sees, invites.',
  },
  {
    title: 'Validation errors',
    file: 'validation.md',
    about: 'How problems are reported, and what the common ones mean.',
  },
  {
    title: 'Versioning',
    file: 'versioning.md',
    about: 'The format version, stable component ids, and saved tables.',
  },
];

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const files = new Map<string, string>();

  const schemas = toJsonSchemas();
  for (const [kind, schema] of Object.entries(schemas)) {
    files.set(
      `packages/formats/schema/${kind}.schema.json`,
      JSON.stringify(schema, null, 2) + '\n',
    );
  }
  for (const entry of KINDS) {
    files.set(
      `docs/reference/${entry.file}`,
      await renderKind(entry, schemas[entry.kind] as Schema),
    );
  }
  files.set('docs/reference/README.md', renderIndex());

  const stale: string[] = [];
  for (const [file, content] of files) {
    const abs = path.join(root, file);
    const current = await readFile(abs, 'utf8').catch(() => undefined);
    if (current === content) continue;
    stale.push(file);
    if (!check) {
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
  }
  if (check && stale.length > 0) {
    console.error(
      `Generated files are out of date. Run \`pnpm generate\` and commit:\n  ${stale.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(stale.length === 0 ? 'Generated files are up to date.' : `Wrote ${stale.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const HEADER =
  '<!-- Generated by scripts/generate.ts from packages/formats/src/schemas.ts. Do not edit by hand. -->\n';

function renderIndex(): string {
  const rows = KINDS.map((k) => `| [${titleOf(k.kind)}](${k.file}) | ${firstSentence(k.intro)} |`);
  return (
    HEADER +
    '# Format reference\n\n' +
    'The technical reference for every Trayful file kind. Each page lists every key with its type and meaning, and ends with a real example from the Harvest Moon sample project.\n\n' +
    '| File kind | What it is |\n| --- | --- |\n' +
    rows.join('\n') +
    '\n\nHow things work across file kinds:\n\n' +
    '| Topic | What it covers |\n| --- | --- |\n' +
    TOPICS.map((t) => `| [${t.title}](${t.file}) | ${t.about} |`).join('\n') +
    '\n\nJSON Schemas for editor autocomplete live in [`packages/formats/schema/`](../../packages/formats/schema/). ' +
    'Add a comment such as `# yaml-language-server: $schema=<path to library.schema.json>` at the top of a YAML file to get completion and checking in editors with the YAML language server.\n'
  );
}

function titleOf(kind: FileKind): string {
  return {
    manifest: 'Manifest',
    library: 'Library',
    inventory: 'Inventory',
    setup: 'Setup',
    table: 'Table state',
  }[kind];
}

function firstSentence(text: string): string {
  return text.split(/(?<=\.)\s/)[0]!;
}

async function renderKind(entry: (typeof KINDS)[number], schema: Schema): Promise<string> {
  const defs = schema.$defs ?? {};
  const rootName = schema.$ref ? refName(schema.$ref) : undefined;
  const rootSchema = rootName ? defs[rootName]! : schema;
  const parts: string[] = [HEADER, `# ${titleOf(entry.kind)}\n`, entry.intro + '\n'];

  parts.push(`## Top-level keys\n`);
  parts.push(propertyTable(rootSchema, defs, 'top'));

  if (entry.kind === 'library') parts.push(primitivesSection());

  for (const [name, def] of Object.entries(defs)) {
    if (name === rootName) continue;
    parts.push(`## ${name}\n`);
    if (def.description) parts.push(def.description + '\n');
    if (def.properties) {
      parts.push(propertyTable(def, defs, name));
      continue;
    }
    parts.push(`Type: ${typeText(def, defs)}\n`);
    // A union with an object branch written inline (such as a field's object form) gets its own table.
    for (const branch of def.anyOf ?? []) {
      if (!branch.properties) continue;
      parts.push(`### ${name} object form\n`);
      if (branch.description) parts.push(branch.description + '\n');
      parts.push(propertyTable(branch, defs, name));
    }
  }

  parts.push('## Example\n');
  if (entry.example) {
    const text = await readFile(path.join(root, example, entry.example), 'utf8');
    const body = text.replace(/^# yaml-language-server:.*\n/, '');
    parts.push(`From \`${example}/${entry.example}\`:\n\n\`\`\`yaml\n${body.trimEnd()}\n\`\`\`\n`);
  } else {
    parts.push(await tableExample());
  }
  return parts.join('\n');
}

function primitivesSection(): string {
  const rows = Object.entries(PRIMITIVE_INFO).map(
    ([name, info]) =>
      `| \`${name}\` | ${info.sides} | ${info.stackable ? 'yes' : ''} | ${info.snapTargets ? 'yes' : ''} | ${info.summary} |`,
  );
  return (
    '## Primitives\n\n' +
    "A type's `base` decides how it behaves on the table.\n\n" +
    '| Base | Sides | Stacks | Snap targets | Notes |\n| --- | --- | --- | --- | --- |\n' +
    rows.join('\n') +
    '\n'
  );
}

async function tableExample(): Promise<string> {
  const { project } = await loadProject(path.join(root, example));
  if (!project) throw new Error(`${example} does not load; run pnpm validate:examples`);
  const file = toTableFile(createTable(project, { name: 'playtest-1', seed: 81723 }));
  const shown = {
    ...file,
    objects: [
      file.objects.find((o) => o.id === 'deck:actions'),
      ...file.objects.filter((o) => o.id === 'action-card.harvest.1' || o.id === 'coins'),
    ],
  };
  const json = JSON.stringify(shown, null, 2)
    .replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1, $2]')
    .replace(/\n {2}\]\n\}$/, '\n    …\n  ]\n}');
  return `A fresh table for Harvest Moon, with most objects left out:\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

function propertyTable(schema: Schema, defs: Record<string, Schema>, context: string): string {
  const required = new Set(schema.required ?? []);
  const rows: string[] = [];
  const nested: string[] = [];
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const inline = inlineObject(prop);
    const type = inline
      ? `object, see [\`${key}\`](#${anchor(`${context} ${key}`)})`
      : typeText(prop, defs);
    rows.push(
      `| \`${key}\` | ${type} | ${required.has(key) ? 'yes' : ''} | ${cell(describe(prop, defs))} |`,
    );
    if (inline) {
      nested.push(`### ${context === 'top' ? '' : `${context} `}${key}\n`);
      nested.push(`<a id="${anchor(`${context} ${key}`)}"></a>\n`);
      nested.push(
        propertyTable(inline, defs, `${context === 'top' ? '' : `${context} `}${key}`.trim()),
      );
    }
  }
  const table =
    '| Key | Type | Required | Description |\n| --- | --- | --- | --- |\n' + rows.join('\n') + '\n';
  return [table, ...nested].join('\n');
}

/** The object schema behind a property when it is written inline (not a named definition). */
function inlineObject(prop: Schema): Schema | undefined {
  if (prop.properties) return prop;
  if (prop.items?.properties) return prop.items;
  return undefined;
}

function describe(prop: Schema, defs: Record<string, Schema>): string {
  const own = prop.description ?? (prop.$ref ? '' : prop.items?.description) ?? '';
  const target = prop.$ref ? defs[refName(prop.$ref)] : undefined;
  const text = own || (target?.properties ? '' : (target?.description ?? ''));
  const constraints: string[] = [];
  if (prop.pattern) constraints.push(`Pattern: \`${prop.pattern}\`.`);
  if (prop.default !== undefined) constraints.push(`Default \`${JSON.stringify(prop.default)}\`.`);
  return [text, ...constraints].filter(Boolean).join(' ');
}

function typeText(s: Schema, defs: Record<string, Schema>): string {
  if (s.$ref) {
    const name = refName(s.$ref);
    return `[${name}](#${anchor(name)})`;
  }
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(', ');
  if (s.anyOf) return s.anyOf.map((a) => typeText(a, defs)).join(' or ');
  if (s.prefixItems) return `[${s.prefixItems.map((p) => typeText(p, defs)).join(', ')}]`;
  if (s.type === 'array') return `list of ${s.items ? typeText(s.items, defs) : 'values'}`;
  if (s.type === 'object') {
    if (s.properties) return 'object';
    if (typeof s.additionalProperties === 'object')
      return `map of text to ${typeText(s.additionalProperties, defs)}`;
    return 'object';
  }
  if (Array.isArray(s.type)) return s.type.map((t) => typeText({ type: t }, defs)).join(' or ');
  // Zod adds the safe-integer limits to every int; they are noise for authors.
  const meaningful = (n: number | undefined) =>
    n !== undefined && Math.abs(n) < Number.MAX_SAFE_INTEGER;
  const range = meaningful(s.exclusiveMinimum)
    ? ` > ${s.exclusiveMinimum}`
    : meaningful(s.minimum)
      ? ` ≥ ${s.minimum}`
      : '';
  const max = meaningful(s.maximum) ? ` ≤ ${s.maximum}` : '';
  const names: Record<string, string> = {
    integer: 'whole number',
    number: 'number',
    string: 'text',
    boolean: 'true or false',
  };
  const name = names[s.type ?? ''] ?? 'value';
  return name + range + max;
}

function refName(ref: string): string {
  return ref.replace(/^#\/\$defs\//, '');
}

function anchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

await main();
