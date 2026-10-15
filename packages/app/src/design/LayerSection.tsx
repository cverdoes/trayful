import { SHAPES, type Layer } from '@trayful/formats/browser';
import { layerKind, type Path } from './edit';
import { ColorInput, NumberInput, PairInput, Row, Select, SizeInput, TextInput } from './controls';
import { setValue } from './store';

type TextLayer = Extract<Layer, { text: string }>;
type ImageLayer = Extract<Layer, { image: string }>;
type ShapeLayer = Extract<Layer, { shape: string }>;

/** The selected layer's settings: where it sits, then what its kind draws. */
export function LayerSection({ layer, path }: Readonly<{ layer: Layer; path: Path }>) {
  const at = (...key: Path) => [...path, ...key];
  return (
    <div className="design-layer" aria-label="Selected layer">
      <h4>Selected layer</h4>
      {'text' in layer && <TextRows layer={layer} at={at} />}
      {'image' in layer && <ImageRows layer={layer} at={at} />}
      {layerKind(layer) === 'shape' && <ShapeRows layer={layer as ShapeLayer} at={at} />}
      <Row label="Position (mm)" path={at('at')}>
        {(id) => <PairInput id={id} value={layer.at} onChange={setValue(at('at'))} />}
      </Row>
      <Row label="Rotate (°)" path={at('rotate')}>
        {(id) => (
          <NumberInput
            id={id}
            value={layer.rotate}
            onChange={setValue(at('rotate'))}
            placeholder="0"
          />
        )}
      </Row>
      <Row label="Opacity" path={at('opacity')}>
        {(id) => (
          <NumberInput
            id={id}
            value={layer.opacity}
            onChange={setValue(at('opacity'))}
            placeholder="1"
          />
        )}
      </Row>
      <Row label="Show when" path={at('when')}>
        {(id) => (
          <TextInput
            id={id}
            value={layer.when}
            onChange={setValue(at('when'))}
            placeholder="always"
            list="design-fields"
          />
        )}
      </Row>
    </div>
  );
}

type At = (...key: Path) => Path;

function TextRows({ layer, at }: Readonly<{ layer: TextLayer; at: At }>) {
  return (
    <>
      <Row label="Text" path={at('text')}>
        {(id) => (
          <textarea
            id={id}
            rows={2}
            value={layer.text}
            onChange={(e) => setValue(at('text'))(e.target.value)}
          />
        )}
      </Row>
      <Row label="Wrap width (mm)" path={at('width')}>
        {(id) => (
          <NumberInput
            id={id}
            value={layer.width}
            onChange={setValue(at('width'))}
            placeholder="no wrapping"
          />
        )}
      </Row>
      <Row label="Align" path={at('align')}>
        {(id) => (
          <Select
            id={id}
            value={layer.align}
            options={['left', 'center', 'right'] as const}
            onChange={setValue(at('align'))}
            empty="left"
          />
        )}
      </Row>
      <Row label="Vertical align" path={at('valign')}>
        {(id) => (
          <Select
            id={id}
            value={layer.valign}
            options={['top', 'middle', 'bottom'] as const}
            onChange={setValue(at('valign'))}
            empty="top"
          />
        )}
      </Row>
      <FontRows layer={layer} at={at} />
      <Row label="Colour" path={at('color')}>
        {(id) => <ColorInput id={id} value={layer.color} onChange={setValue(at('color'))} />}
      </Row>
    </>
  );
}

function FontRows({ layer, at }: Readonly<{ layer: TextLayer; at: At }>) {
  return (
    <>
      <Row label="Font size (pt)" path={at('font', 'size')}>
        {(id) => (
          <NumberInput
            id={id}
            value={layer.font?.size}
            onChange={setValue(at('font', 'size'))}
            placeholder="10"
          />
        )}
      </Row>
      <Row label="Weight" path={at('font', 'weight')}>
        {(id) => (
          <Select
            id={id}
            value={layer.font?.weight}
            options={['normal', 'bold'] as const}
            onChange={setValue(at('font', 'weight'))}
            empty="normal"
          />
        )}
      </Row>
      <Row label="Style" path={at('font', 'style')}>
        {(id) => (
          <Select
            id={id}
            value={layer.font?.style}
            options={['normal', 'italic'] as const}
            onChange={setValue(at('font', 'style'))}
            empty="normal"
          />
        )}
      </Row>
    </>
  );
}

function ImageRows({ layer, at }: Readonly<{ layer: ImageLayer; at: At }>) {
  return (
    <>
      <Row label="Image" path={at('image')}>
        {(id) => (
          <TextInput
            id={id}
            value={layer.image}
            onChange={(v) => setValue(at('image'))(v ?? '')}
            placeholder="assets/art.svg or {{field}}"
            list="design-fields"
          />
        )}
      </Row>
      <Row label="Size (mm)" path={at('size')}>
        {(id) => <SizeInput id={id} value={layer.size} onChange={setValue(at('size'))} />}
      </Row>
      <Row label="Fit" path={at('fit')}>
        {(id) => (
          <Select
            id={id}
            value={layer.fit}
            options={['cover', 'contain', 'stretch'] as const}
            onChange={setValue(at('fit'))}
            empty="cover"
          />
        )}
      </Row>
    </>
  );
}

function ShapeRows({ layer, at }: Readonly<{ layer: ShapeLayer; at: At }>) {
  return (
    <>
      <Row label="Shape" path={at('shape')}>
        {(id) => (
          <Select
            id={id}
            value={layer.shape}
            options={SHAPES}
            onChange={(v) => setValue(at('shape'))(v ?? 'rect')}
          />
        )}
      </Row>
      <Row label="Size (mm)" path={at('size')}>
        {(id) => <SizeInput id={id} value={layer.size} onChange={setValue(at('size'))} />}
      </Row>
      <Row label="Radius (mm)" path={at('r')}>
        {(id) => (
          <NumberInput
            id={id}
            value={layer.r}
            onChange={setValue(at('r'))}
            placeholder="use size"
          />
        )}
      </Row>
      <Row label="Fill" path={at('fill')}>
        {(id) => <ColorInput id={id} value={layer.fill} onChange={setValue(at('fill'))} />}
      </Row>
      <Row label="Outline" path={at('stroke')}>
        {(id) => <ColorInput id={id} value={layer.stroke} onChange={setValue(at('stroke'))} />}
      </Row>
      <Row label="Outline width (mm)" path={at('strokeWidth')}>
        {(id) => (
          <NumberInput id={id} value={layer.strokeWidth} onChange={setValue(at('strokeWidth'))} />
        )}
      </Row>
    </>
  );
}
