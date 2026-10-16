// The Tray: one component's inventory entries, and the CSV files they read rows
// from, as the designer edits them. Saved through the same checks as every
// other authoring change.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { csvTable, csvText, slugify, type CsvTable } from '@trayful/formats';
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
