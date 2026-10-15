import { FIELD_TYPES, type ComponentType, type Field } from '@trayful/formats/browser';
import { useState } from 'react';
import {
  fieldFromSpec,
  fieldSpec,
  freeFieldName,
  parseDefault,
  parseValues,
  renameKey,
  setIn,
  type FieldSpec,
} from './edit';
import { Row, Select, TextInput } from './controls';
import { editDraft } from './store';

const KINDS = [...FIELD_TYPES, 'enum'] as const;

/** The type's data fields, which the inventory fills in for each design. */
export function FieldsSection({ type }: Readonly<{ type: ComponentType }>) {
  const fields = Object.entries(type.fields ?? {});
  return (
    <section>
      <h3>Fields</h3>
      {fields.length === 0 && <p className="muted">No fields: every component looks the same.</p>}
      {fields.map(([name, field]) => (
        <FieldEditor key={name} name={name} field={field} />
      ))}
      <button
        type="button"
        onClick={() => editDraft((t) => setIn(t, ['fields', freeFieldName(t)], 'string'))}
      >
        + Add field
      </button>
    </section>
  );
}

function FieldEditor({ name, field }: Readonly<{ name: string; field: Field }>) {
  const spec = fieldSpec(field);
  const update = (change: Partial<FieldSpec>) =>
    editDraft((t) => setIn(t, ['fields', name], fieldFromSpec({ ...spec, ...change })));
  return (
    <div className="design-field">
      <Row label="Name" path={['fields', name]}>
        {(id) => <FieldName id={id} name={name} />}
      </Row>
      <Row label="Kind">
        {(id) => (
          <Select
            id={id}
            value={spec.type}
            options={KINDS}
            onChange={(kind) => update({ type: kind ?? 'string' })}
          />
        )}
      </Row>
      {spec.type === 'enum' && (
        <Row label="Values" path={['fields', name, 'enum']}>
          {(id) => (
            <TextInput
              id={id}
              value={spec.values.join(', ')}
              placeholder="red, green, blue"
              onChange={(text) => update({ values: parseValues(text ?? '') })}
            />
          )}
        </Row>
      )}
      <Row label="Default" path={['fields', name, 'default']}>
        {(id) => (
          <TextInput
            id={id}
            value={spec.default?.toString()}
            onChange={(text) => update({ default: parseDefault(text, spec) })}
          />
        )}
      </Row>
      <div className="design-field-actions">
        <label>
          <input
            type="checkbox"
            checked={spec.optional}
            onChange={(e) => update({ optional: e.target.checked })}
          />{' '}
          Optional
        </label>
        <button
          type="button"
          onClick={() => editDraft((t) => setIn(t, ['fields', name], undefined))}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/**
 * A field's name, renamed when the box loses focus or Enter is pressed rather
 * than on every key, since each name in between would be a different field.
 */
function FieldName({ id, name }: Readonly<{ id: string; name: string }>) {
  const [text, setText] = useState(name);
  const commit = () => {
    const next = text.trim();
    if (next && next !== name) {
      editDraft((t) => setIn(t, ['fields'], renameKey(t.fields ?? {}, name, next)));
    } else setText(name);
  };
  return (
    <input
      id={id}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}
