import type { ComponentType, SnapTarget } from '@trayful/formats/browser';
import { sizeOf } from '../render/geometry';
import { parseValues, setIn } from './edit';
import { NumberInput, PairInput, Row, SizeInput, TextInput } from './controls';
import { newTarget, SNAPPING_BASES, spotsOf, targetKind, type TargetKind } from './snaps';
import { editDraft, setValue, useDesign } from './store';

const KIND_LABEL: Record<TargetKind, string> = { grid: 'Grid', points: 'Points', area: 'Area' };

/**
 * Where other pieces snap onto a board, tile or zone. Targets are drawn on the
 * front, where they can also be picked and dragged.
 */
export function SnapSection({ type }: Readonly<{ type: ComponentType }>) {
  const selected = useDesign((s) => s.target);
  if (!SNAPPING_BASES.has(type.base)) return null;
  const targets = type.snap ?? [];
  const add = (kind: TargetKind) => {
    editDraft((t) => setIn(t, ['snap', targets.length], newTarget(kind, t, sizeOf(t))));
    useDesign.setState({ side: 'front', layer: undefined, target: targets.length });
  };
  return (
    <section aria-label="Snap spots">
      <h3>Snap spots</h3>
      <p className="muted">Where pieces snap when dropped on this {type.base}.</p>
      <ul className="design-targets">
        {targets.map((t, i) => (
          <li key={t.id} className={i === selected ? 'chosen' : undefined}>
            <button
              type="button"
              className="layer-name"
              onClick={() => useDesign.setState({ side: 'front', layer: undefined, target: i })}
            >
              {t.id} <span className="muted">({describe(t)})</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="design-add">
        Add:{' '}
        {(['grid', 'points', 'area'] as const).map((kind) => (
          <button key={kind} type="button" onClick={() => add(kind)}>
            {KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      {selected !== undefined && targets[selected] && (
        <TargetEditor target={targets[selected]} index={selected} />
      )}
    </section>
  );
}

function describe(target: SnapTarget): string {
  const kind = targetKind(target);
  if (kind === 'area') return 'area';
  const spots = spotsOf(target).length;
  return `${kind}, ${spots} spot${spots === 1 ? '' : 's'}`;
}

function TargetEditor({ target, index }: Readonly<{ target: SnapTarget; index: number }>) {
  const at = (...key: string[]) => ['snap', index, ...key];
  const remove = () => {
    editDraft((t) => setIn(t, ['snap', index], undefined));
    useDesign.setState({ target: undefined });
  };
  return (
    <div className="design-layer" aria-label="Selected snap target">
      <h4>{KIND_LABEL[targetKind(target)]} spots</h4>
      <Row label="Id" path={at('id')}>
        {(id) => (
          <TextInput id={id} value={target.id} onChange={(v) => setValue(at('id'))(v ?? '')} />
        )}
      </Row>
      <Row label="Accepts" path={at('accepts')}>
        {(id) => (
          <TextInput
            id={id}
            value={target.accepts?.join(', ')}
            placeholder="anything"
            onChange={(text) => {
              const ids = parseValues(text ?? '').map(String);
              setValue(at('accepts'))(ids.length ? ids : undefined);
            }}
          />
        )}
      </Row>
      {target.grid && <GridRows grid={target.grid} at={at} />}
      {target.points && <PointRows target={target} at={at} />}
      {target.area && (
        <>
          <Row label="Top-left (mm)" path={at('area', 'at')}>
            {(id) => (
              <PairInput id={id} value={target.area!.at} onChange={setValue(at('area', 'at'))} />
            )}
          </Row>
          <Row label="Size (mm)" path={at('area', 'size')}>
            {(id) => (
              <SizeInput
                id={id}
                value={target.area!.size}
                onChange={setValue(at('area', 'size'))}
              />
            )}
          </Row>
        </>
      )}
      <button type="button" onClick={remove}>
        Remove {target.id}
      </button>
    </div>
  );
}

type At = (...key: string[]) => (string | number)[];

function GridRows({ grid, at }: Readonly<{ grid: NonNullable<SnapTarget['grid']>; at: At }>) {
  return (
    <>
      <Row label="First spot (mm)" path={at('grid', 'origin')}>
        {(id) => (
          <PairInput id={id} value={grid.origin} onChange={setValue(at('grid', 'origin'))} />
        )}
      </Row>
      <Row label="Columns" path={at('grid', 'cols')}>
        {(id) => <NumberInput id={id} value={grid.cols} onChange={setValue(at('grid', 'cols'))} />}
      </Row>
      <Row label="Rows" path={at('grid', 'rows')}>
        {(id) => <NumberInput id={id} value={grid.rows} onChange={setValue(at('grid', 'rows'))} />}
      </Row>
      <Row label="Spacing (mm)" path={at('grid', 'cell')}>
        {(id) => <SizeInput id={id} value={grid.cell} onChange={setValue(at('grid', 'cell'))} />}
      </Row>
      <p className="muted">
        On the board, drag spot 0 to move the grid, its diagonal neighbour to change the spacing,
        and the last spot to add columns and rows.
      </p>
    </>
  );
}

function PointRows({ target, at }: Readonly<{ target: SnapTarget; at: At }>) {
  const points = target.points ?? [];
  return (
    <>
      <p className="muted">
        Click on the board to add the next spot; drag a spot to move it. Spots are numbered in the
        order they were added.
      </p>
      <button
        type="button"
        disabled={points.length <= 1}
        onClick={() => setValue(at('points'))(points.slice(0, -1))}
      >
        Remove spot {points.length - 1}
      </button>
    </>
  );
}
