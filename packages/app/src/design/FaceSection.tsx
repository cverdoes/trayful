import type { ComponentType } from '@trayful/formats/browser';
import {
  addLayer,
  layerLabel,
  layersOf,
  moveLayer,
  newLayer,
  removeLayer,
  twoSided,
  type LayerKind,
  type Side,
} from './edit';
import { ColorInput, Row } from './controls';
import { LayerSection } from './LayerSection';
import { editDraft, setValue, useDesign } from './store';

/** One side of the type: its colours and its layers, and the selected layer. */
export function FaceSection({ type }: Readonly<{ type: ComponentType }>) {
  const side = useDesign((s) => s.side);
  const layer = useDesign((s) => s.layer);
  const layers = layersOf(type, side);
  const selected = layer === undefined ? undefined : layers[layer];
  return (
    <section>
      <h3>
        <SideTabs type={type} side={side} />
      </h3>
      <Row label="Fill" path={[side, 'fill']}>
        {(id) => (
          <ColorInput id={id} value={type[side]?.fill} onChange={setValue([side, 'fill'])} />
        )}
      </Row>
      <Row label="Outline" path={[side, 'stroke']}>
        {(id) => (
          <ColorInput id={id} value={type[side]?.stroke} onChange={setValue([side, 'stroke'])} />
        )}
      </Row>
      <LayerList type={type} side={side} selected={layer} />
      {selected && layer !== undefined && (
        <LayerSection layer={selected} path={[side, 'layers', layer]} />
      )}
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
      onClick={() => useDesign.setState({ side: to, layer: undefined })}
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

/** The face's layers, top of the drawing order last, with buttons to change them. */
function LayerList({
  type,
  side,
  selected,
}: Readonly<{ type: ComponentType; side: Side; selected?: number }>) {
  const layers = layersOf(type, side);
  const add = (kind: LayerKind) => {
    editDraft((t) => addLayer(t, side, newLayer(kind, t)));
    useDesign.setState({ layer: layers.length });
  };
  const change = (edit: (t: ComponentType) => ComponentType, layer: number | undefined) => {
    editDraft(edit);
    useDesign.setState({ layer });
  };
  return (
    <div className="design-layers">
      <ol aria-label="Layers">
        {layers.map((layer, i) => (
          // Layers have no ids; their place in the list is what the file has too.
          <li key={i} className={i === selected ? 'chosen' : undefined}>
            <button
              type="button"
              className="layer-name"
              onClick={() => useDesign.setState({ layer: i })}
            >
              {layerLabel(layer)}
            </button>
            <button
              type="button"
              title="Draw earlier (further down)"
              aria-label="Move down"
              onClick={() => change((t) => moveLayer(t, side, i, -1), i - 1)}
              disabled={i === 0}
            >
              ↓
            </button>
            <button
              type="button"
              title="Draw later (on top)"
              aria-label="Move up"
              onClick={() => change((t) => moveLayer(t, side, i, 1), i + 1)}
              disabled={i === layers.length - 1}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Remove layer"
              title="Remove layer"
              onClick={() => change((t) => removeLayer(t, side, i), undefined)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <div className="design-add">
        Add:{' '}
        <button type="button" onClick={() => add('text')}>
          Text
        </button>
        <button type="button" onClick={() => add('shape')}>
          Shape
        </button>
        <button type="button" onClick={() => add('image')}>
          Image
        </button>
      </div>
    </div>
  );
}
