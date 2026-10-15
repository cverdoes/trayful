import { PRIMITIVES, SHAPES, formatPath, type ComponentType } from '@trayful/formats/browser';
import { parseValues } from './edit';
import { ColorInput, NumberInput, PairInput, Row, Select, SizeInput, TextInput } from './controls';
import { FaceSection } from './FaceSection';
import { FieldsSection } from './FieldsSection';
import { renameDraftType } from './projectEdits';
import { SnapSection } from './SnapSection';
import { setValue, useDesign } from './store';

/** The panel on the right: everything about the type being edited, top to bottom. */
export function Inspector() {
  const draft = useDesign((s) => s.draft);
  if (!draft)
    return <aside className="design-inspector muted">Pick a type, or make a new one.</aside>;
  return (
    <aside className="design-inspector" aria-label="Inspector">
      <Problems />
      <TypeSection type={draft} />
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
      <Row label="Behaves like" path={['base']}>
        {(id) => (
          <Select id={id} value={type.base} options={PRIMITIVES} onChange={setValue(['base'])} />
        )}
      </Row>
      <Row label="Size (mm)" path={['size']}>
        {(id) => <SizeInput id={id} value={type.size} onChange={setValue(['size'])} />}
      </Row>
      <Row label="Outline" path={['shape']}>
        {(id) => (
          <Select
            id={id}
            value={type.shape}
            options={SHAPES}
            onChange={setValue(['shape'])}
            empty="default"
          />
        )}
      </Row>
      <Row label="Corner (mm)" path={['corner']}>
        {(id) => (
          <NumberInput
            id={id}
            value={type.corner}
            onChange={setValue(['corner'])}
            placeholder="0"
          />
        )}
      </Row>
      <Row label="Fill" path={['fill']}>
        {(id) => <ColorInput id={id} value={type.fill} onChange={setValue(['fill'])} />}
      </Row>
      <Row label="Rotate step (°)" path={['rotationStep']}>
        {(id) => (
          <NumberInput
            id={id}
            value={type.rotationStep}
            onChange={setValue(['rotationStep'])}
            placeholder="90"
          />
        )}
      </Row>
      <PrimitiveRows type={type} />
    </section>
  );
}

/** Settings only some primitives have: a counter's range and a die's faces. */
function PrimitiveRows({ type }: Readonly<{ type: ComponentType }>) {
  if (type.base === 'counter') {
    return (
      <Row label="Range" path={['range']}>
        {(id) => (
          <PairInput
            id={id}
            value={type.range}
            labels={['min', 'max']}
            onChange={setValue(['range'])}
          />
        )}
      </Row>
    );
  }
  if (type.base !== 'die') return null;
  return (
    <Row label="Die faces" path={['faces']}>
      {(id) => (
        <TextInput
          id={id}
          value={type.faces?.join(', ')}
          placeholder="1, 2, 3, 4, 5, 6"
          onChange={(text) => setValue(['faces'])(text && parseValues(text))}
        />
      )}
    </Row>
  );
}
