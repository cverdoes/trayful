// Which page of the inspector shows what is selected on the canvas.
import type { ComponentType } from '@trayful/formats/browser';
import { itemsOf, itemLabel, type Side } from './edit';
import type { InspectorPage } from './store';

/** What is selected: a layer or label on a side, or a drop area. */
interface Selection {
  side: Side;
  layer?: number;
  target?: number;
}

/**
 * The page that edits a selection: the drop areas for a drop area, a side's
 * labels for a label, its drawing for any other layer. Nothing selected has none.
 */
export function pageFor(type: ComponentType, selection: Selection): InspectorPage | undefined {
  if (selection.target !== undefined) return { kind: 'drop-areas' };
  if (selection.layer === undefined) return undefined;
  const item = itemsOf(type, selection.side)[selection.layer];
  if (!item) return undefined;
  return { kind: item.label ? 'labels' : 'drawing', side: selection.side };
}

/** A side's labels, or its other layers, as the main page sums them up: their names in order. */
export function itemsSummary(type: ComponentType, side: Side, labels: boolean): string[] {
  return itemsOf(type, side)
    .filter((item) => Boolean(item.label) === labels)
    .map((item) =>
      item.label ? (item.label.field ?? item.label.text ?? '') : itemLabel(item).toLowerCase(),
    );
}
