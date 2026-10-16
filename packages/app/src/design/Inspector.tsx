import {
  REPRESENTATIONS,
  SHAPES,
  formatPath,
  isValued,
  valuesOf,
  type ComponentType,
  type Control,
} from '@trayful/formats/browser';
import { parseValues, setIn, withRepresentation, type Path } from './edit';
import { Checkbox, NumberInput, PairInput, Row, Select, SizeInput, TextInput } from './controls';
import { FaceSection } from './FaceSection';
import { FieldsSection } from './FieldsSection';
import { renameDraftType } from './projectEdits';
import { SnapSection } from './SnapSection';
import { editDraft, setValue, useDesign } from './store';

/** The panel on the right: everything about the type being edited, top to bottom. */
export function Inspector() {
  const draft = useDesign((s) => s.draft);
  if (!draft)
    return <aside className="design-inspector muted">Pick a type, or make a new one.</aside>;
  return (
    <aside className="design-inspector" aria-label="Inspector">
      <Problems />
      <TypeSection type={draft} />
      <BehaviourSection type={draft} />
      <FieldsSection type={draft} />
      <FaceSection type={draft} />
      <SnapSection type={draft} />
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

function TypeSection({ type }: Readonly<{ type: ComponentType }>) {
  return (
    <section>
      <h3>Type</h3>
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
      <Row label="Description" path={['description']}>
        {(id) => (
          <TextInput id={id} value={type.description} onChange={setValue(['description'])} />
        )}
      </Row>
      <Row label="Is a" path={['is']}>
        {(id) => (
          <Select
            id={id}
            value={type.is}
            options={REPRESENTATIONS}
            onChange={(is) => is && editDraft((t) => withRepresentation(t, is))}
          />
        )}
      </Row>
      <Row label="Size (mm)" path={['size']}>
        {(id) => <SizeInput id={id} value={type.size} onChange={setValue(['size'])} />}
      </Row>
      <Row label="Outline" path={['face', 'shape']}>
        {(id) => (
          <Select
            id={id}
            value={type.face?.shape}
            options={SHAPES}
            onChange={setValue(['face', 'shape'])}
            empty="rect"
          />
        )}
      </Row>
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
    </section>
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
  if (isValued(type)) return <ValueSection type={type} />;
  const step = typeof type.rotates === 'object' ? type.rotates.step : undefined;
  const partners = typeof type.stackable === 'object' ? type.stackable.with : undefined;
  return (
    <section aria-label="Behaviour">
      <h3>Behaviour</h3>
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
            <TextInput
              id={id}
              value={partners?.join(', ')}
              placeholder="only its own kind"
              onChange={(text) => {
                const ids = parseValues(text ?? '').map(String);
                setValue(['stackable', 'with'])(ids.length ? ids : undefined);
              }}
            />
          )}
        </Row>
      )}
    </section>
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
    <section aria-label="Values">
      <h3>Values</h3>
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
    </section>
  );
}
