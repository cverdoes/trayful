import type { Vec2 } from '@trayful/formats/browser';
import type { ResolvedProject } from '@trayful/formats';
import { BOX_WIDTH, deckStackId, MARGIN, newDeck, newPiece, rows, type Sized } from './box.js';
import { boundsOf } from './layout.js';
import {
  onTable,
  removeObject,
  sizeOf,
  type Piece,
  type TableObject,
  type TableState,
} from './state.js';

/**
 * Brings a table in line with edited project files: pieces get their component's
 * current data and type, components new to the inventory are put on the table
 * below everything else (cards join their deck when it is still there), and
 * pieces whose component is gone are taken off. Returns the same state when
 * nothing changed.
 */
export function syncTable(state: TableState, project: ResolvedProject): TableState {
  const objects: Record<string, TableObject> = { ...state.objects };
  const removed = removeGone(objects, project);
  const updated = refreshPieces(objects, project);
  const fresh = addNew(objects, project);
  if (!removed && !updated && fresh === undefined) return state;
  const next = { ...state, objects };
  return fresh?.length ? placeBelow(next, project, fresh) : next;
}

/** Takes pieces whose component is gone off the table, and out of their stacks. Says whether any were. */
function removeGone(objects: Record<string, TableObject>, project: ResolvedProject): boolean {
  const ids = new Set(project.components.map((c) => c.id));
  let changed = false;
  for (const object of Object.values(objects)) {
    if (object.kind !== 'piece' || ids.has(object.id)) continue;
    removeObject(objects, object.id);
    changed = true;
    const stack = object.parent === undefined ? undefined : objects[object.parent];
    if (stack?.kind !== 'stack') continue;
    const items = stack.items.filter((id) => id !== object.id);
    if (items.length === 0) removeObject(objects, stack.id);
    else objects[stack.id] = { ...stack, items };
  }
  return changed;
}

/** Gives every piece its component's current type and data. Says whether any changed. */
function refreshPieces(objects: Record<string, TableObject>, project: ResolvedProject): boolean {
  const specs = new Map(project.components.map((c) => [c.id, c]));
  let changed = false;
  for (const object of Object.values(objects)) {
    if (object.kind !== 'piece') continue;
    const spec = specs.get(object.id)!;
    const data = Object.keys(spec.data).length ? spec.data : undefined;
    if (spec.type === object.type && JSON.stringify(data) === JSON.stringify(object.data)) continue;
    const next: Piece = { ...object, type: spec.type };
    if (data) next.data = data;
    else delete next.data;
    objects[object.id] = next;
    changed = true;
  }
  return changed;
}

/**
 * Adds the components new to the inventory: cards join their deck if it is on
 * the table. Returns what still needs a place on the table, or undefined when
 * nothing was added.
 */
function addNew(
  objects: Record<string, TableObject>,
  project: ResolvedProject,
): Sized[] | undefined {
  const fresh: Sized[] = [];
  let added = false;
  let z = Math.max(-1, ...Object.values(objects).map((o) => o.z)) + 1;
  for (const spec of project.components) {
    const type = project.types[spec.type];
    if (objects[spec.id] || !type) continue;
    added = true;
    if (!spec.deck) {
      objects[spec.id] = { ...newPiece(spec, type, 'up'), z: z++ };
      fresh.push({ id: spec.id, size: sizeOf(type) });
      continue;
    }
    const stackId = deckStackId(spec.deck);
    const deck = objects[stackId];
    objects[spec.id] = newPiece(spec, type, 'down', stackId);
    if (deck?.kind === 'stack') {
      objects[stackId] = { ...deck, items: [spec.id, ...deck.items] };
    } else {
      // A new deck, or one whose cards have all been dealt out: start a pile.
      objects[stackId] = newDeck(spec.deck, [spec.id], z++);
      fresh.push({ id: stackId, size: sizeOf(type) });
    }
  }
  return added ? fresh : undefined;
}

/** Lays the fresh objects out in rows below everything else on the table. */
function placeBelow(state: TableState, project: ResolvedProject, fresh: Sized[]): TableState {
  const ids = new Set(fresh.map((f) => f.id));
  const others = Object.values(state.objects).filter((o) => onTable(o) && !ids.has(o.id));
  const box = boundsOf(state, project.types, others);
  const origin: Vec2 = others.length ? [box.x0, box.y1 + MARGIN] : [0, 0];
  const objects = { ...state.objects };
  for (const [id, pos] of rows(fresh, origin, BOX_WIDTH)) {
    objects[id] = { ...objects[id]!, pos };
  }
  return { ...state, objects };
}
