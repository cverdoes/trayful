import { SHAPES, type ComponentType } from '@trayful/formats/browser';
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
  type Item,
  type LayerKind,
  type Side,
} from './edit';
import { ColorInput, NumberInput, Row, Select } from './controls';
import { ImagePicker } from './ImagePicker';
import { LayerSection } from './LayerSection';
import { Section } from './Section';
import { editDraft, setValue, useDesign } from './store';

/**
 * One side of a component, the way it is built up: its colours and outline, an
 * image, then labels. Shapes and pictures beyond that are tucked away under
 * Advanced, since most components never need them.
 */
export function SideSection({ type, side }: Readonly<{ type: ComponentType; side: Side }>) {
  const selected = useDesign((s) => (s.side === side ? s.layer : undefined));
  const items = itemsOf(type, side);
  const chosen = selected === undefined ? undefined : items[selected];
  const at = (key: string) => [...sidePath(side), key];
  const name = side === 'front' ? 'Face' : 'Back';
  return (
    <Section title={name}>
      {side === 'front' && <OutlineRows type={type} />}
      <Row label="Fill" path={at('fill')}>
        {(id) => (
          <ColorInput id={id} value={sideOf(type, side)?.fill} onChange={setValue(at('fill'))} />
        )}
      </Row>
      <Row label="Outline colour" path={at('stroke')}>
        {(id) => (
          <ColorInput
            id={id}
            value={sideOf(type, side)?.stroke}
            onChange={setValue(at('stroke'))}
          />
        )}
      </Row>
      <ImagePicker type={type} side={side} />
      <h4>Labels</h4>
      <ItemList type={type} side={side} labels selected={selected} />
      {chosen?.label && <LayerSection item={chosen} />}
      <details className="design-advanced" open={items.some((item) => !item.label)}>
        <summary>Advanced drawing</summary>
        <p className="muted">Shapes, pictures and text drawn under the labels.</p>
        <ItemList type={type} side={side} labels={false} selected={selected} />
        {chosen && !chosen.label && <LayerSection item={chosen} />}
      </details>
    </Section>
  );
}

/** The outline every side shares: its shape, and for rectangles how round the corners are. */
function OutlineRows({ type }: Readonly<{ type: ComponentType }>) {
  const shape = type.face?.shape ?? 'rect';
  return (
    <>
      <Row label="Shape" path={['face', 'shape']}>
        {(id) => (
          <Select
            id={id}
            value={type.face?.shape}
            options={SHAPES.filter((s) => s !== 'rect')}
            onChange={setValue(['face', 'shape'])}
            empty="rect"
          />
        )}
      </Row>
      {shape === 'rect' && (
        <Row label="Corner (mm)" path={['face', 'corner']}>
          {(id) => (
            <NumberInput
              id={id}
              value={type.face?.corner}
              onChange={setValue(['face', 'corner'])}
              placeholder="0"
            />
          )}
        </Row>
      )}
    </>
  );
}

const ADDABLE_LAYERS: [LayerKind, string][] = [
  ['text', 'Text'],
  ['shape', 'Shape'],
  ['image', 'Picture'],
];

/**
 * A side's labels, or its advanced layers, in drawing order (on top last), with
 * buttons to select, reorder, remove and add them.
 */
function ItemList({
  type,
  side,
  labels,
  selected,
}: Readonly<{ type: ComponentType; side: Side; labels: boolean; selected?: number }>) {
  const listed = itemsOf(type, side)
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => Boolean(item.label) === labels);
  const select = (layer: number | undefined) =>
    useDesign.setState({ side, layer, target: undefined });
  const add = (item: Parameters<typeof addItem>[2]) => {
    let index: number | undefined;
    editDraft((t) => {
      const added = addItem(t, side, item);
      index = added.index;
      return added.type;
    });
    select(index);
  };
  const change = (edit: (t: ComponentType) => ComponentType, layer: number | undefined) => {
    editDraft(edit);
    select(layer);
  };
  return (
    <div className="design-layers">
      <ol aria-label={labels ? 'Labels' : 'Layers'}>
        {listed.map(({ item, index }) => (
          // Layers have no ids; their place in the list is what the file has too.
          <li key={index} className={index === selected ? 'chosen' : undefined}>
            <ItemButtons
              item={item}
              onSelect={() => select(index)}
              onMove={(by) => change((t) => moveItem(t, side, index, by), index + by)}
              canMove={(by) => canMove(type, side, index, by)}
              onRemove={() => change((t) => removeItem(t, side, index), undefined)}
            />
          </li>
        ))}
      </ol>
      <div className="design-add">
        Add:{' '}
        {labels ? (
          <button type="button" onClick={() => add({ label: newLabel(type) })}>
            Label
          </button>
        ) : (
          ADDABLE_LAYERS.map(([kind, label]) => (
            <button key={kind} type="button" onClick={() => add({ layer: newLayer(kind, type) })}>
              {label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ItemButtons({
  item,
  onSelect,
  onMove,
  canMove: movable,
  onRemove,
}: Readonly<{
  item: Item;
  onSelect: () => void;
  onMove: (by: 1 | -1) => void;
  canMove: (by: 1 | -1) => boolean;
  onRemove: () => void;
}>) {
  return (
    <>
      <button type="button" className="layer-name" onClick={onSelect}>
        {itemLabel(item)}
      </button>
      <button
        type="button"
        title="Draw earlier (further down)"
        aria-label="Move down"
        onClick={() => onMove(-1)}
        disabled={!movable(-1)}
      >
        ↓
      </button>
      <button
        type="button"
        title="Draw later (on top)"
        aria-label="Move up"
        onClick={() => onMove(1)}
        disabled={!movable(1)}
      >
        ↑
      </button>
      <button type="button" aria-label="Remove" title="Remove" onClick={onRemove}>
        ×
      </button>
    </>
  );
}
