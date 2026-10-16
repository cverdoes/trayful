import type { ComponentType } from '@trayful/formats/browser';
import {
  addItem,
  canMove,
  itemLabel,
  itemsOf,
  moveItem,
  newLabel,
  newLayer,
  removeItem,
  sideOf,
  sidePath,
  twoSided,
  type LayerKind,
  type Side,
} from './edit';
import { ColorInput, Row } from './controls';
import { LayerSection } from './LayerSection';
import { editDraft, setValue, useDesign } from './store';

/** One side of the type: its colours, its layers and labels, and the selected one. */
export function FaceSection({ type }: Readonly<{ type: ComponentType }>) {
  const side = useDesign((s) => s.side);
  const layer = useDesign((s) => s.layer);
  const selected = layer === undefined ? undefined : itemsOf(type, side)[layer];
  const at = (key: string) => [...sidePath(side), key];
  return (
    <section>
      <h3>
        <SideTabs type={type} side={side} />
      </h3>
      <Row label="Fill" path={at('fill')}>
        {(id) => (
          <ColorInput id={id} value={sideOf(type, side)?.fill} onChange={setValue(at('fill'))} />
        )}
      </Row>
      <Row label="Outline" path={at('stroke')}>
        {(id) => (
          <ColorInput
            id={id}
            value={sideOf(type, side)?.stroke}
            onChange={setValue(at('stroke'))}
          />
        )}
      </Row>
      <LayerList type={type} side={side} selected={layer} />
      {selected && <LayerSection item={selected} />}
    </section>
  );
}

function SideTabs({ type, side }: Readonly<{ type: ComponentType; side: Side }>) {
  if (!twoSided(type)) return <>Face</>;
  const tab = (to: Side, label: string) => (
    <button
      type="button"
      className={side === to ? 'tab chosen' : 'tab'}
      aria-pressed={side === to}
      onClick={() => useDesign.setState({ side: to, layer: undefined, target: undefined })}
    >
      {label}
    </button>
  );
  return (
    <span className="design-tabs">
      {tab('front', 'Front')}
      {tab('back', 'Back')}
    </span>
  );
}

/** The face's layers and labels, top of the drawing order last, with buttons to change them. */
function LayerList({
  type,
  side,
  selected,
}: Readonly<{ type: ComponentType; side: Side; selected?: number }>) {
  const items = itemsOf(type, side);
  const add = (kind: LayerKind | 'label') => {
    let index: number | undefined;
    editDraft((t) => {
      const added = addItem(
        t,
        side,
        kind === 'label' ? { label: newLabel(t) } : { layer: newLayer(kind, t) },
      );
      index = added.index;
      return added.type;
    });
    useDesign.setState({ layer: index, target: undefined });
  };
  const change = (edit: (t: ComponentType) => ComponentType, layer: number | undefined) => {
    editDraft(edit);
    useDesign.setState({ layer });
  };
  return (
    <div className="design-layers">
      <ol aria-label="Layers">
        {items.map((item, i) => (
          // Layers have no ids; their place in the list is what the file has too.
          <li key={i} className={i === selected ? 'chosen' : undefined}>
            <button
              type="button"
              className="layer-name"
              onClick={() => useDesign.setState({ layer: i, target: undefined })}
            >
              {itemLabel(item)}
            </button>
            <button
              type="button"
              title="Draw earlier (further down)"
              aria-label="Move down"
              onClick={() => change((t) => moveItem(t, side, i, -1), i - 1)}
              disabled={!canMove(type, side, i, -1)}
            >
              ↓
            </button>
            <button
              type="button"
              title="Draw later (on top)"
              aria-label="Move up"
              onClick={() => change((t) => moveItem(t, side, i, 1), i + 1)}
              disabled={!canMove(type, side, i, 1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Remove"
              title="Remove"
              onClick={() => change((t) => removeItem(t, side, i), undefined)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <AddButtons add={add} />
    </div>
  );
}

const ADDABLE: [LayerKind | 'label', string][] = [
  ['label', 'Label'],
  ['text', 'Text'],
  ['shape', 'Shape'],
  ['image', 'Image'],
];

function AddButtons({ add }: Readonly<{ add: (kind: LayerKind | 'label') => void }>) {
  return (
    <div className="design-add">
      Add:{' '}
      {ADDABLE.map(([kind, label]) => (
        <button key={kind} type="button" onClick={() => add(kind)}>
          {label}
        </button>
      ))}
    </div>
  );
}
