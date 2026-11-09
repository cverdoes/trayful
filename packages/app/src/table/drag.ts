import {
  ridersOf,
  surfaceOf,
  type Command,
  type SnapSpot,
  type Stack,
  type TableView,
} from '@trayful/core';
import type Konva from 'konva';
import {
  CLICK_SLOP,
  drawCommands,
  fromStack,
  moveCommands,
  snapAt,
  snapHint,
  type Elsewhere,
  type Vec,
} from './drops';
import { myId, overHandTray } from './hand';
import { dropTarget, type Types } from '../render/geometry';
import { useStore } from '../store';
import { surfaceUnder } from './tiles';
import { toWorld, viewportOf } from './viewport';

/**
 * Dragging on the table: whole objects (with the selection and whatever rides on
 * them), and single cards off a stack. Shows where a drop would snap while dragging,
 * or which other surface it would go to, and sends the commands for the drop when
 * let go.
 */
export class TableDrag {
  /** The canvas node of each object on the table. */
  readonly nodes = new Map<string, Konva.Group>();
  /** Where each dragged object started. */
  private readonly starts = new Map<string, Vec>();
  /** Pieces snapped onto a dragged object, which follow it, and where they started. */
  private readonly riders = new Map<string, Vec>();

  start(id: string): void {
    const { table, types } = scene();
    const { selection, select } = useStore.getState();
    // Only what lies on the same surface goes along: a drag stays inside its tile.
    const surface = surfaceOf(table.objects[id]!);
    const moving = selection.includes(id)
      ? selection.filter((o) => table.objects[o] && surfaceOf(table.objects[o]) === surface)
      : [id];
    if (!selection.includes(id)) select([id]);
    this.starts.clear();
    this.riders.clear();
    for (const other of moving) {
      const o = table.objects[other];
      if (o) this.starts.set(other, [o.pos[0], o.pos[1]]);
    }
    for (const rider of ridersOf(table.objects, this.starts.keys())) {
      const o = table.objects[rider];
      if (o && !this.starts.has(rider)) this.riders.set(rider, [o.pos[0], o.pos[1]]);
    }
    useStore.setState({ snapHint: snapHint(table, types, table.objects[id]!, this.dragging()) });
  }

  move(id: string, node: Konva.Group): void {
    const start = this.starts.get(id);
    if (!start) return;
    const dx = node.x() - start[0];
    const dy = node.y() - start[1];
    for (const [other, pos] of [...this.starts, ...this.riders]) {
      if (other !== id) this.nodes.get(other)?.position({ x: pos[0] + dx, y: pos[1] + dy });
    }
    const { table, types } = scene();
    const object = table.objects[id]!;
    const surface = surfaceOf(object);
    // Both are asked, so each light goes out when the pointer moves on to the other.
    const away = hoverElsewhere(node, surface);
    if (hoverHand(node) || away) return highlight(undefined);
    const point: Vec = [node.x(), node.y()];
    const moved = [...this.starts.keys()];
    if (dropTarget(table, types, { dragged: moved, point, surface })) return highlight(undefined);
    const ignore = this.dragging();
    highlight(snapAt(table, types, { object, point, surface, ignore, group: moved.length > 1 }));
  }

  end(id: string, node: Konva.Group): void {
    const start = this.starts.get(id);
    const moved = [...this.starts.keys()];
    const ignore = this.dragging();
    const riders = [...this.riders.keys()];
    this.starts.clear();
    this.riders.clear();
    const hand = pointerOverHand(node) ? myId() : undefined;
    useStore.setState({ snapHint: undefined, overHand: false, dropSurface: undefined });
    if (!start) return;
    const by: Vec = [node.x() - start[0], node.y() - start[1]];
    if (Math.hypot(by[0], by[1]) < CLICK_SLOP) return this.restore([...moved, ...riders]);
    // Riders stay on the table; only what was picked up goes into the hand.
    if (hand) this.restore(riders);
    const { table, types } = scene();
    const onto = hand ? undefined : elsewhere(node, surfaceOf(table.objects[id]!));
    send(moveCommands(table, types, { moved, lead: id, by, ignore, hand, onto }));
  }

  drawStart(stack: Stack): void {
    const { table, types } = scene();
    useStore.getState().select([]);
    useStore.setState({ snapHint: snapHint(table, types, stack, new Set([stack.id])) });
  }

  drawMove(stack: Stack, node: Konva.Group): void {
    const surface = surfaceOf(stack);
    const away = hoverElsewhere(node, surface);
    if (hoverHand(node) || away) return highlight(undefined);
    const { table, types } = scene();
    const point = fromStack(stack, [node.x(), node.y()]);
    if (dropTarget(table, types, { dragged: [stack.id], point, surface }))
      return highlight(undefined);
    const ignore = new Set([stack.id]);
    highlight(snapAt(table, types, { object: stack, point, surface, ignore, group: false }));
  }

  /** A click on a card of a stack selects the stack; a drag takes the card off it. */
  drawEnd(stack: Stack, piece: string, node: Konva.Group, home: Vec): void {
    const hand = pointerOverHand(node) ? myId() : undefined;
    useStore.setState({ snapHint: undefined, overHand: false, dropSurface: undefined });
    const local: Vec = [node.x(), node.y()];
    const { select, shiftDown } = useStore.getState();
    if (Math.hypot(local[0] - home[0], local[1] - home[1]) < CLICK_SLOP) {
      node.position({ x: home[0], y: home[1] });
      select([stack.id], shiftDown ? 'toggle' : 'replace');
      return;
    }
    const { table, types } = scene();
    const onto = hand ? undefined : elsewhere(node, surfaceOf(stack));
    const result = drawCommands(table, types, { stack, piece, local, hand, onto });
    send(result.commands);
    if (result.select) select([result.select]);
  }

  /** Puts objects back where the table has them, after a drag that did nothing. */
  private restore(ids: string[]): void {
    const { table } = scene();
    for (const id of ids) {
      const o = table.objects[id];
      if (o) this.nodes.get(id)?.position({ x: o.pos[0], y: o.pos[1] });
    }
  }

  private dragging(): Set<string> {
    return new Set([...this.starts.keys(), ...this.riders.keys()]);
  }
}

/** The table and its types; drags only happen while both are on screen. */
function scene(): { table: TableView; types: Types } {
  const { table, view } = useStore.getState();
  return { table: table!, types: view!.types };
}

function send(commands: Command[]): void {
  const { command } = useStore.getState();
  for (const c of commands) command(c);
}

function highlight(spot: SnapSpot | undefined): void {
  const hint = useStore.getState().snapHint;
  if (hint && hint.active !== spot?.ref)
    useStore.setState({ snapHint: { ...hint, active: spot?.ref } });
}

/** Where on the page the pointer of a drag on a canvas is, also outside that canvas. */
function pagePointer(node: Konva.Node): { x: number; y: number } | undefined {
  const stage = node.getStage();
  const p = stage?.getPointerPosition();
  if (!stage || !p) return undefined;
  const box = stage.container().getBoundingClientRect();
  return { x: box.left + p.x, y: box.top + p.y };
}

/** Whether the pointer of a drag on the canvas is over the hand tray. */
function pointerOverHand(node: Konva.Node): boolean {
  const p = pagePointer(node);
  return !!p && !!myId() && overHandTray(p.x, p.y);
}

/**
 * The other surface the pointer of a drag from surface `from` is over, if any:
 * with the point of its tile under the pointer, or without one over its chip.
 */
function elsewhere(node: Konva.Node, from: string): Elsewhere | undefined {
  const p = pagePointer(node);
  const under = p && surfaceUnder(p.x, p.y);
  if (!p || !under || under.surface === from) return undefined;
  const { surface, tile } = under;
  if (!tile) return { surface };
  const viewport = viewportOf(useStore.getState(), surface);
  return { surface, point: toWorld(viewport, { x: p.x - tile.left, y: p.y - tile.top }) };
}

/** Lights up the tile or chip of another surface while something is dragged over it. */
function hoverElsewhere(node: Konva.Node, from: string): boolean {
  const dropSurface = elsewhere(node, from)?.surface;
  if (useStore.getState().dropSurface !== dropSurface) useStore.setState({ dropSurface });
  return dropSurface !== undefined;
}

/** Lights up the hand tray while something is dragged over it. */
function hoverHand(node: Konva.Node): boolean {
  const over = pointerOverHand(node);
  if (useStore.getState().overHand !== over) useStore.setState({ overHand: over });
  return over;
}
