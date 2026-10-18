import {
  REPRESENTATIONS,
  formatPath,
  isValued,
  valuesOf,
  type ComponentType,
  type Control,
} from '@trayful/formats/browser';
import { useStore } from '../store';
import { ComponentPicker, componentOptions, NO_TYPES } from './ComponentPicker';
import { parseValues, setIn, withRepresentation, type Path } from './edit';
import { Checkbox, NumberInput, PairInput, Row, SizeInput, TextInput } from './controls';
import { FieldsSection } from './FieldsSection';
import { KIND_TEXT } from './kinds';
import { renameDraftType } from './projectEdits';
import { Section } from './Section';
import { SideSection } from './SideSection';
import { SnapSection } from './SnapSection';
import { editDraft, setValue, useDesign } from './store';

/**
 * The panel on the right: the component built up step by step, top to bottom.
 * What it is decides what follows, and each behaviour adds its own settings
 * only once it is switched on.
 */
export function Inspector() {
  const draft = useDesign((s) => s.draft);
  if (!draft)
    return <aside className="design-inspector muted">Pick a component, or make a new one.</aside>;
  return (
    <aside className="design-inspector" aria-label="Inspector">
      <Problems />
      <BasicsSection type={draft} />
      <KindSection type={draft} />
      <SideSection type={draft} side="front" />
      {isValued(draft) ? <ValueSection type={draft} /> : <BehaviourSection type={draft} />}
      {draft.flippable !== undefined && <SideSection type={draft} side="back" />}
      <SnapSection type={draft} />
      <FieldsSection type={draft} />
      <datalist id="design-fields">
        {Object.keys(draft.fields ?? {}).map((name) => (
          <option key={name} value={`{{${name}}}`} />
        ))}
      </datalist>
    </aside>
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
function askRename(id: string) {
  const to = window.prompt(
    `New id for "${id}". The inventory and setups that use it are changed too.`,
    id,
  );
  if (to) void renameDraftType(to.trim());
}

/** Its name and size. */
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
          <div className="design-pair">
            <TextInput id={id} value={type.id} onChange={() => undefined} readOnly />
            <button type="button" onClick={() => askRename(type.id)}>
              Rename…
            </button>
          </div>
        )}
      </Row>
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

/** What it is: a piece, a zone, a die or a counter. Changing it drops what no longer applies. */
function KindSection({ type }: Readonly<{ type: ComponentType }>) {
  return (
    <Section title="What it is">
      <div className="design-kinds" role="radiogroup" aria-label="What it is">
        {REPRESENTATIONS.map((is) => (
          <button
            key={is}
            type="button"
            role="radio"
            aria-checked={type.is === is}
            className={type.is === is ? 'kind chosen' : 'kind'}
            title={KIND_TEXT[is].about}
            onClick={() => type.is !== is && editDraft((t) => withRepresentation(t, is))}
          >
            {KIND_TEXT[is].name}
          </button>
        ))}
      </div>
      <p className="muted">{KIND_TEXT[type.is].about}</p>
    </Section>
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
