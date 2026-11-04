// The inputs the Tray fills field values in with: one per kind of field.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { useState } from 'react';
import { ColorInput, NumberInput, TextInput } from './controls';
import { parseValues } from './edit';
import { TilePicker } from './TilePicker';
import type { Column } from './tray';

/** A field's value for one design, edited the way its kind of field suits. */
export function FieldInput({
  column,
  value,
  image,
  label,
  onChange,
}: Readonly<{
  column: Column;
  value: Scalar | undefined;
  /** The image the component picks tiles of, for its `tile` field. */
  image?: Asset;
  label: string;
  onChange: (value: Scalar | undefined) => void;
}>) {
  const { name, field } = column;
  if (name === 'tile' && image) {
    return <TileInput image={image} value={value} label={label} onChange={onChange} />;
  }
  if (field.type === 'enum') {
    const options = field.enum ?? [];
    return (
      <select
        aria-label={label}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(options.find((o) => String(o) === e.target.value))}
      >
        <option value="">{field.default === undefined ? '' : `(${field.default})`}</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'bool') {
    return (
      <input
        type="checkbox"
        aria-label={label}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked ? true : undefined)}
      />
    );
  }
  if (field.type === 'int' || field.type === 'number') {
    return (
      <NumberInput
        label={label}
        value={typeof value === 'number' ? value : undefined}
        placeholder={field.default === undefined ? undefined : String(field.default)}
        onChange={onChange}
      />
    );
  }
  const text = value === undefined ? undefined : String(value);
  return field.type === 'color' ? (
    <ColorInput label={label} value={text} onChange={onChange} />
  ) : (
    <TextInput label={label} value={text} onChange={onChange} />
  );
}

/** A tile of an image, picked by clicking it. */
function TileInput({
  image,
  value,
  label,
  onChange,
}: Readonly<{
  image: Asset;
  value: Scalar | undefined;
  label: string;
  onChange: (value: Scalar | undefined) => void;
}>) {
  const tile = typeof value === 'number' ? value : 0;
  return (
    <details className="tray-tile">
      <summary aria-label={label}>Tile {tile}</summary>
      <TilePicker image={image} selected={tile} label={`Pick ${label}`} onPick={onChange} />
    </details>
  );
}

/**
 * A list of values typed with commas between them, such as `red, green`. What is
 * typed stays while it is typed; the values are reported on every change.
 */
export function ListInput({
  values,
  label,
  onChange,
}: Readonly<{
  values: Scalar[] | undefined;
  label: string;
  onChange: (values: Scalar[] | undefined) => void;
}>) {
  const shown = (values ?? []).join(', ');
  const [typed, setTyped] = useState(shown);
  const parsed = (text: string) => parseValues(text);
  // A change from elsewhere (an undo, a reload) shows the new values.
  const text = parsed(typed).join(', ') === shown ? typed : shown;
  return (
    <input
      type="text"
      aria-label={label}
      value={text}
      placeholder="values, with commas between"
      onChange={(e) => {
        setTyped(e.target.value);
        const list = parsed(e.target.value);
        onChange(list.length ? list : undefined);
      }}
    />
  );
}
