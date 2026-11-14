// The Tray: one component's inventory entries, and the CSV files they read rows
// from, as the designer edits them. Saved through the same checks as every
// other authoring change.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  componentFields,
  csvTable,
  csvText,
  slugify,
  type CsvTable,
  type Scalar,
} from '@trayful/formats';
import { isMap, isSeq } from 'yaml';
import {
  AuthoringError,
  commit,
  inside,
  inventoryChange,
  oneAtATime,
  readDocument,
  requireCurrentFormat,
  unusedPath,
  type FileChange,
} from './authoring.js';
import type { Workspace } from './workspace.js';

/** One component's entries (without `component`), and the CSV files they name, by file. */
export interface Tray {
  entries: Record<string, unknown>[];
  tables: Record<string, CsvTable>;
}

/** The entries for `type` as the inventory file has them, and the CSV files they read. */
export async function readTray(
  workspace: Workspace,
  projectId: string,
  type: string,
): Promise<Tray> {
  const project = workspace.project(projectId);
  requireCurrentFormat(project);
  if (!project.types[type]) throw new AuthoringError(`There is no component "${type}".`);
  const doc = await readDocument(project.dir, project.manifest.inventory);
  const components = doc.get('components');
  const entries = isSeq(components)
    ? components.items.filter((n) => isMap(n) && n.get('component') === type).map(withoutComponent)
    : [];
  const tables: Record<string, CsvTable> = {};
  for (const file of csvFiles(entries)) {
    tables[file] = await readTable(project.dir, file);
  }
  return { entries, tables };
}

/** An inventory entry as plain data, without the `component` the Tray it is in decides. */
function withoutComponent(node: unknown): Record<string, unknown> {
  const entry = (node as { toJSON(): Record<string, unknown> }).toJSON();
  return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'component'));
}

async function readTable(dir: string, file: string): Promise<CsvTable> {
  try {
    return csvTable(await readFile(inside(dir, file), 'utf8'));
  } catch {
    // A missing or unreadable file is reported by the project's own checks.
    return { header: [], rows: [] };
  }
}

/** The CSV files entries read their rows from. */
function csvFiles(entries: Record<string, unknown>[]): string[] {
  return entries.flatMap((e) => (typeof e.from === 'string' ? [e.from] : []));
}

async function writeTray(
  workspace: Workspace,
  projectId: string,
  type: string,
  tray: Tray,
): Promise<Tray> {
  const project = workspace.project(projectId);
  const used = new Set(csvFiles(tray.entries));
  const changes: FileChange[] = Object.entries(tray.tables).map(([file, table]) => {
    if (!used.has(file)) {
      throw new AuthoringError(`"${file}" is not a CSV file of "${type}"'s entries.`);
    }
    if (!file.toLowerCase().endsWith('.csv'))
      throw new AuthoringError(`"${file}" is not a .csv file.`);
    inside(project.dir, file);
    return { file, content: csvText(table) };
  });
  changes.push(await inventoryChange(project, type, tray.entries));
  await commit(workspace, projectId, changes);
  return readTray(workspace, projectId, type);
}

/**
 * Saves one component's entries and the CSV files they read, all or nothing. A
 * change that breaks the project is undone and reported.
 */
export const saveTray = oneAtATime(writeTray);

async function addCsv(
  workspace: Workspace,
  projectId: string,
  type: string,
  csv: { name: string; text: string },
): Promise<Tray> {
  const project = workspace.project(projectId);
  const current = await readTray(workspace, projectId, type);
  const stem = slugify(path.basename(csv.name, path.extname(csv.name))) || type;
  const file = unusedPath(project.dir, `data/${stem}.csv`);
  const entries = [...current.entries, { from: file }];
  await commit(workspace, projectId, [
    { file, content: csv.text },
    await inventoryChange(project, type, entries),
  ]);
  return readTray(workspace, projectId, type);
}

/** Copies a CSV file into the project's `data` folder and adds an entry that reads it. */
export const importCsv = oneAtATime(addCsv);

/** The designs an entry has typed in: its rows, each over the values the entry shares. */
function typedDesigns(entry: Record<string, unknown>): Record<string, Scalar>[] {
  const shared = (entry.data ?? {}) as Record<string, Scalar>;
  const items = (entry.items ?? [{}]) as Record<string, Scalar>[];
  return items.map((item) => ({ ...shared, ...item }));
}

/**
 * Designs as a CSV table: a column per field of the component, then one per
 * other value the designs give, such as `count`. A value not given is an empty cell.
 */
export function designsTable(fields: string[], designs: Record<string, Scalar>[]): CsvTable {
  const header = [...new Set([...fields, ...designs.flatMap((design) => Object.keys(design))])];
  const cell = (value: Scalar | undefined) => (value === undefined ? '' : String(value));
  return { header, rows: designs.map((design) => header.map((name) => cell(design[name]))) };
}

async function entryToCsv(
  workspace: Workspace,
  projectId: string,
  type: string,
  index: number,
): Promise<Tray> {
  const project = workspace.project(projectId);
  const current = await readTray(workspace, projectId, type);
  const entry = current.entries[index];
  if (!entry || entry.from !== undefined || entry.each !== undefined) {
    throw new AuthoringError('Only designs typed into the Tray can be moved to a CSV file.');
  }
  const table = designsTable(
    Object.keys(componentFields(project.types[type]!)),
    typedDesigns(entry),
  );
  const stem = slugify(typeof entry.deck === 'string' ? entry.deck : type) || 'designs';
  const file = unusedPath(project.dir, `data/${stem}.csv`);
  // The entry keeps its deck and copies; its designs are in the file from here on.
  const kept = Object.entries(entry).filter(([key]) => key !== 'data' && key !== 'items');
  const moved = { ...Object.fromEntries(kept), from: file };
  const entries = current.entries.map((e, i) => (i === index ? moved : e));
  await commit(workspace, projectId, [
    { file, content: csvText(table) },
    await inventoryChange(project, type, entries),
  ]);
  return readTray(workspace, projectId, type);
}

/**
 * Moves the designs typed into one entry to a new CSV file in the project's
 * `data` folder, which the entry then reads. Its deck and copies stay.
 */
export const moveToCsv = oneAtATime(entryToCsv);
