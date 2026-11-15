import {
  formatPath,
  isValued,
  valuesOf,
  type ComponentType,
  type Control,
} from '@trayful/formats/browser';
import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Button, IconButton } from '../../ui/Button';
import { ask } from '../../ui/dialogs';
import { ComponentPicker, componentOptions, NO_TYPES } from './ComponentPicker';
import { parseValues, setIn, withRepresentation, type Path } from '../edit';
import { Checkbox, NumberInput, PairInput, Row, SizeInput, TextInput } from './controls';
import { FieldsSection } from './FieldsSection';
import { KindDialog } from './KindDialog';
import { KIND_TEXT } from '../kinds';
import { renameDraftType } from '../projectEdits';
import { Section } from './Section';
import { SideSection } from './SideSection';
import { SnapSection } from './SnapSection';
import { pageFits, SubPage } from './SubPage';
import { editDraft, setValue, useDesign } from '../store';

/**
 * The panel on the right: the component built up step by step, top to bottom.
 * What it is decides what follows, and each behaviour adds its own settings
 * only once it is switched on.
 */
export function Inspector() {
  const draft = useDesign((s) => s.draft);
  const page = useDesign((s) => s.page);
  const shown = draft && page && pageFits(draft, page) ? page : undefined;
  const panel = useRef<HTMLElement>(null);
  // Where the main page was scrolled to, to come back to from a page of its own.
  const mainScroll = useRef(0);
  const onMain = shown === undefined;
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = onMain ? mainScroll.current : 0;
  }, [onMain]);
  if (!draft)
    return <aside className="design-inspector muted">Pick a component, or make a new one.</aside>;
  return (
    <aside
      ref={panel}
      className="design-inspector"
      aria-label="Inspector"
      onScroll={(e) => {
        if (onMain) mainScroll.current = e.currentTarget.scrollTop;
      }}
    >
      <Problems />
      {shown ? <SubPage type={draft} page={shown} /> : <MainPage type={draft} />}
      <datalist id="design-fields">
        {Object.keys(draft.fields ?? {}).map((name) => (
          <option key={name} value={`{{${name}}}`} />
        ))}
      </datalist>
    </aside>
  );
}

/** The main page: every part of the component, with links to the pages for longer lists. */
function MainPage({ type: draft }: Readonly<{ type: ComponentType }>) {
  return (
    <>
      <BasicsSection type={draft} />
      <SideSection type={draft} side="front" />
      {isValued(draft) && <ValueSection type={draft} />}
      {!isValued(draft) && draft.is !== 'stamp' && <BehaviourSection type={draft} />}
      {draft.flippable !== undefined && <SideSection type={draft} side="back" />}
      <SnapSection type={draft} />
      {draft.is !== 'stamp' && <FieldsSection type={draft} />}
    </>
  );
}

/** Every problem with the type, so none goes unseen when its control is scrolled away. */
function Problems() {
  const problems = useDesign((s) => s.problems);
  if (!problems.length) return null;
  return (
    <section className="design-problems" aria-label="Problems">
      <h3>Not saved until fixed</h3>
      <ul>
        {problems.map((p) => (
          <li key={`${formatPath(p.path)} ${p.message}`}>
            {p.path.length > 0 && <code>{formatPath(p.path)}</code>} {p.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Asks for a new id; the inventory and setups that use the old one change with it. */
async function askRename(id: string): Promise<void> {
  const to = await ask({
    title: `Rename "${id}"`,
    text: 'The inventory and setups that use the id are changed too.',
    label: 'New id',
    value: id,
    action: 'Rename',
  });
  if (to) await renameDraftType(to);
}

/** Its name, id, kind and size. */
function BasicsSection({ type }: Readonly<{ type: ComponentType }>) {
  return (
    <Section title="Basics">
      <Row label="Name" path={['name']}>
        {(id) => (
          <TextInput
            id={id}
            value={type.name}
            onChange={setValue(['name'])}
            placeholder={type.id}
          />
        )}
      </Row>
      <Row label="Id" path={['id']}>
        {(id) => (
          <div className="design-inline">
            <TextInput id={id} value={type.id} onChange={() => undefined} readOnly />
            <IconButton icon="edit" label="Rename…" onClick={() => void askRename(type.id)} />
          </div>
        )}
      </Row>
      <KindRow type={type} />
      <Row label="Size (mm)" path={['size']}>
        {(id) => <SizeInput id={id} value={type.size} onChange={setValue(['size'])} />}
      </Row>
      <Row label="Description" path={['description']}>
        {(id) => (
          <TextInput id={id} value={type.description} onChange={setValue(['description'])} />
        )}
      </Row>
    </Section>
  );
}

/**
 * What it is: a piece, a zone, a die, a counter or a stamp. It is rarely changed,
 * so changing it takes a dialog; the change drops what no longer applies.
 */
function KindRow({ type }: Readonly<{ type: ComponentType }>) {
  const [changing, setChanging] = useState(false);
  return (
    <Row label="Kind" path={['is']}>
      {(id) => (
        <div className="design-pair" title={KIND_TEXT[type.is].about}>
          <span className="design-kind">{KIND_TEXT[type.is].name}</span>
          <Button
            id={id}
            variant="quiet"
            onClick={() => setChanging(true)}
            aria-label="Change kind"
          >
            Change…
          </Button>
          {changing && (
            <KindDialog
              type={type}
              onClose={() => setChanging(false)}
              onPick={(is) => {
                setChanging(false);
                editDraft((t) => withRepresentation(t, is));
              }}
            />
          )}
        </div>
      )}
    </Row>
  );
}

/** Turns a behaviour on with its defaults (`true`), or off. */
const toggle = (key: Path[number]) => (on: boolean) => {
  setValue([key])(on ? true : undefined);
  // Without a back there is only the face to show.
  if (key === 'flippable' && !on) useDesign.setState({ side: 'front', layer: undefined });
};

/** What the component does on the table: each behaviour is off until switched on. */
function BehaviourSection({ type }: Readonly<{ type: ComponentType }>) {
  const step = typeof type.rotates === 'object' ? type.rotates.step : undefined;
  const partners = typeof type.stackable === 'object' ? type.stackable.with : undefined;
  const types = useStore((s) => s.view?.types ?? NO_TYPES);
  return (
    <Section title="Behaviour">
      <Checkbox
        label="Flippable (has a back)"
        checked={type.flippable !== undefined}
        onChange={toggle('flippable')}
      />
      <Checkbox label="Rotates" checked={type.rotates !== undefined} onChange={toggle('rotates')} />
      {type.rotates !== undefined && (
        <Row label="Rotate step (°)" path={['rotates', 'step']}>
          {(id) => (
            <NumberInput
              id={id}
              value={step}
              onChange={setValue(['rotates', 'step'])}
              placeholder="90"
            />
          )}
        </Row>
      )}
      <Checkbox
        label="Stackable"
        checked={type.stackable !== undefined}
        onChange={toggle('stackable')}
      />
      {type.stackable !== undefined && (
        <Row label="Stacks with" path={['stackable', 'with']}>
          {(id) => (
            <ComponentPicker
              id={id}
              value={partners}
              // Only stackable components can share a stack.
              options={componentOptions(
                types,
                (t) => t.id !== type.id && t.stackable !== undefined,
              )}
              placeholder="only its own kind"
              onChange={setValue(['stackable', 'with'])}
            />
          )}
        </Row>
      )}
    </Section>
  );
}

/** A die's or counter's values: a range of numbers or a list, and how they change. */
function ValueSection({ type }: Readonly<{ type: ComponentType }>) {
  const controls = valuesOf(type)?.controls ?? [];
  const setControl = (control: Control) => (on: boolean) =>
    setValue(['values', 'controls'])(
      on ? [...controls, control] : controls.filter((c) => c !== control),
    );
  // A die or counter has a range or a list of values, never both, and at least one control.
  const setValues = (key: 'range' | 'list', value: unknown) =>
    editDraft((t) =>
      setIn(
        setIn(t, ['values', key === 'range' ? 'list' : 'range'], undefined),
        ['values', key],
        value,
      ),
    );
  const control = (name: Control, label: string) => (
    <Checkbox
      label={label}
      checked={controls.includes(name)}
      disabled={controls.length === 1 && controls.includes(name)}
      onChange={setControl(name)}
    />
  );
  return (
    <Section title="Values">
      <Row label="Range" path={['values', 'range']}>
        {(id) => (
          <PairInput
            id={id}
            value={type.values?.range}
            labels={['min', 'max']}
            onChange={(range) => setValues('range', range)}
          />
        )}
      </Row>
      <Row label="Or a list" path={['values', 'list']}>
        {(id) => (
          <TextInput
            id={id}
            value={type.values?.list?.join(', ')}
            placeholder="1, 2, 3, 4, 5, 6"
            onChange={(text) => {
              const values = parseValues(text ?? '');
              setValues('list', values.length ? values : undefined);
            }}
          />
        )}
      </Row>
      {control('roll', 'Can be rolled')}
      {control('step', 'Steps up and down')}
    </Section>
  );
}
