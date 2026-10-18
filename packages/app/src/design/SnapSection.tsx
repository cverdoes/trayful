import {
  AREA_MODES,
  dropMode,
  isValued,
  SPOT_MODES,
  type ComponentType,
  type DropMode,
  type SnapTarget,
} from '@trayful/formats/browser';
import { useState } from 'react';
import { sizeOf } from '../render/geometry';
import { useStore } from '../store';
import { acceptOptions, ComponentPicker, NO_TYPES } from './ComponentPicker';
import { DropAreaDialog, DROP_AREA_KINDS } from './DropAreaDialog';
import { setIn } from './edit';
import { NumberInput, PairInput, Row, Select, SizeInput, TextInput } from './controls';
import { Section } from './Section';
import { newTarget, spotsOf, targetKind, type NewTargetKind } from './snaps';
import { editDraft, setValue, useDesign } from './store';

/** A drop area kind's name, as the dialog that adds one offers it. */
const kindName = (kind: NewTargetKind) => DROP_AREA_KINDS.find((k) => k.kind === kind)?.name;

const MODE_LABEL: Record<DropMode, string> = {
  single: 'One thing per spot',
  pile: 'A stack on each spot',
  group: 'A group on each spot (pick any)',
  free: 'Things where they are dropped',
  row: 'A row, left to right',
  bag: 'A bag: hidden, drawn at random',
};

/**
 * A container's drop areas: where other pieces land when dropped on it. Areas are
 * drawn on the face, where they can also be picked and dragged.
 */
export function SnapSection({ type }: Readonly<{ type: ComponentType }>) {
  const selected = useDesign((s) => s.target);
  const [adding, setAdding] = useState(false);
  if (isValued(type)) return null;
  const targets = type.container ?? [];
  const add = (kind: NewTargetKind) => {
    setAdding(false);
    editDraft((t) => setIn(t, ['container', targets.length], newTarget(kind, t, sizeOf(t))));
    useDesign.setState({ side: 'front', layer: undefined, target: targets.length });
  };
  return (
    <Section title="Drop areas">
      <p className="muted">
        Where pieces land when dropped on this {type.is}. With one, it is a container: what lies on
        it moves with it.
      </p>
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
        <button type="button" onClick={() => setAdding(true)}>
          + Add drop area
        </button>
      </div>
      {adding && <DropAreaDialog onPick={add} onClose={() => setAdding(false)} />}
      {selected !== undefined && targets[selected] && (
        <TargetEditor target={targets[selected]} index={selected} />
      )}
    </Section>
  );
}

/** What one spot of a target in this mode holds, as the list of drop areas names it. */
const SPOT_NOUN: Partial<Record<DropMode, string>> = { pile: 'stack', group: 'group' };

function describe(target: SnapTarget): string {
  const kind = targetKind(target);
  const mode = dropMode(target);
  if (kind === 'area') return mode === 'free' ? 'area' : mode;
  const spots = spotsOf(target).length;
  const what = SPOT_NOUN[mode] ?? 'spot';
  return `${kind}, ${spots} ${what}${spots === 1 ? '' : 's'}`;
}

function TargetEditor({ target, index }: Readonly<{ target: SnapTarget; index: number }>) {
  const at = (...key: string[]) => ['container', index, ...key];
  const types = useStore((s) => s.view?.types ?? NO_TYPES);
  const remove = () => {
    // A container has at least one area, so removing the last one stops it being one.
    editDraft((t) =>
      setIn(t, (t.container ?? []).length > 1 ? ['container', index] : ['container'], undefined),
    );
    useDesign.setState({ target: undefined });
  };
  return (
    <div className="design-layer" aria-label="Selected drop area">
      <h4>{kindName(targetKind(target))}</h4>
      <Row label="Id" path={at('id')}>
        {(id) => (
          <TextInput id={id} value={target.id} onChange={(v) => setValue(at('id'))(v ?? '')} />
        )}
      </Row>
      <Row label="Accepts" path={at('accepts')}>
        {(id) => (
          <ComponentPicker
            id={id}
            value={target.accepts}
            options={acceptOptions(types)}
            placeholder="anything"
            onChange={setValue(at('accepts'))}
          />
        )}
      </Row>
      <Row label="Holds" path={at('mode')}>
        {(id) => (
          <Select
            id={id}
            value={target.mode}
            // The first mode is the default, offered as leaving the mode out.
            options={(target.area ? AREA_MODES : SPOT_MODES).slice(1)}
            labels={MODE_LABEL}
            empty={MODE_LABEL[target.area ? 'free' : 'single']}
            onChange={setValue(at('mode'))}
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
        On the board, drag spot 0 to move the grid, the handle next to it to change the spacing, and
        the handle past the last spot to add columns and rows.
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
