import { ridersOf, type Command, type SnapSpot, type Stack, type TableView } from '@trayful/core';
import type Konva from 'konva';
import {
  CLICK_SLOP,
  drawCommands,
  fromStack,
  moveCommands,
  snapAt,
  snapHint,
  type Vec,
} from './drops';
import { myId, overHandTray } from './hand';
import { dropTarget, type Types } from './render/geometry';
import { useStore } from './store';

/**
 * Dragging on the table: whole objects (with the selection and whatever rides on
 * them), and single cards off a stack. Shows where a drop would snap while dragging,
 * and sends the commands for the drop when let go.
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
    const moving = selection.includes(id) ? selection : [id];
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
    if (hoverHand(node)) return highlight(undefined);
    const { table, types } = scene();
    const point: Vec = [node.x(), node.y()];
    const moved = [...this.starts.keys()];
    if (dropTarget(table, types, moved, point)) return highlight(undefined);
    const object = table.objects[id]!;
    highlight(
      snapAt(table, types, { object, point, ignore: this.dragging(), group: moved.length > 1 }),
    );
  }

  end(id: string, node: Konva.Group): void {
    const start = this.starts.get(id);
    const moved = [...this.starts.keys()];
    const ignore = this.dragging();
    const riders = [...this.riders.keys()];
    this.starts.clear();
    this.riders.clear();
    const hand = pointerOverHand(node) ? myId() : undefined;
    useStore.setState({ snapHint: undefined, overHand: false });
    if (!start) return;
    const by: Vec = [node.x() - start[0], node.y() - start[1]];
    if (Math.hypot(by[0], by[1]) < CLICK_SLOP) return this.restore([...moved, ...riders]);
    // Riders stay on the table; only what was picked up goes into the hand.
    if (hand) this.restore(riders);
    const { table, types } = scene();
    send(moveCommands(table, types, { moved, lead: id, by, ignore, hand }));
  }

  drawStart(stack: Stack): void {
    const { table, types } = scene();
    useStore.getState().select([]);
    useStore.setState({ snapHint: snapHint(table, types, stack, new Set([stack.id])) });
  }

  drawMove(stack: Stack, node: Konva.Group): void {
    if (hoverHand(node)) return highlight(undefined);
    const { table, types } = scene();
    const point = fromStack(stack, [node.x(), node.y()]);
    if (dropTarget(table, types, [stack.id], point)) return highlight(undefined);
    highlight(
      snapAt(table, types, { object: stack, point, ignore: new Set([stack.id]), group: false }),
    );
  }

  /** A click on a card of a stack selects the stack; a drag takes the card off it. */
  drawEnd(stack: Stack, piece: string, node: Konva.Group, home: Vec): void {
    const hand = pointerOverHand(node) ? myId() : undefined;
    useStore.setState({ snapHint: undefined, overHand: false });
    const local: Vec = [node.x(), node.y()];
    const { select, shiftDown } = useStore.getState();
    if (Math.hypot(local[0] - home[0], local[1] - home[1]) < CLICK_SLOP) {
      node.position({ x: home[0], y: home[1] });
      select([stack.id], shiftDown ? 'toggle' : 'replace');
      return;
    }
    const { table, types } = scene();
    const result = drawCommands(table, types, { stack, piece, local, hand });
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

/** Whether the pointer of a drag on the canvas is over the hand tray. */
function pointerOverHand(node: Konva.Node): boolean {
  const stage = node.getStage();
  const p = stage?.getPointerPosition();
  if (!stage || !p || !myId()) return false;
  const box = stage.container().getBoundingClientRect();
  return overHandTray(box.left + p.x, box.top + p.y);
}

/** Lights up the hand tray while something is dragged over it. */
function hoverHand(node: Konva.Node): boolean {
  const over = pointerOverHand(node);
  if (useStore.getState().overHand !== over) useStore.setState({ overHand: over });
  return over;
}
