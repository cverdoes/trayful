// Small form controls for the inspector. Each edits one value and shows the
// problems found at its path in the type.
import { formatPath, type ComponentType } from '@trayful/formats/browser';
import { useId, useState, type ReactNode } from 'react';
import { useStore } from '../../store';
import { ColourPicker } from '../../ui/ColourPicker';
import { useDesign } from '../store';
import { fieldSpec, type Path } from '../edit';

/** Problems with the value at exactly this path. */
function useProblemsAt(path: Path | undefined): string[] {
  const problems = useDesign((s) => s.problems);
  if (!path) return [];
  const at = formatPath(path);
  return problems.filter((p) => formatPath(p.path) === at).map((p) => p.message);
}

/** A labelled row holding one control, with its problems under it. */
export function Row({
  label,
  path,
  children,
}: Readonly<{ label: string; path?: Path; children: (id: string) => ReactNode }>) {
  const id = useId();
  const problems = useProblemsAt(path);
  return (
    <div className={problems.length ? 'design-row invalid' : 'design-row'}>
      <label htmlFor={id}>{label}</label>
      <div className="design-control">
        {children(id)}
        {problems.map((p) => (
          <p key={p} className="design-problem">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

/** A checkbox with its label, for switching something on or off. */
export function Checkbox({
  label,
  checked,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <label className="design-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />{' '}
      {label}
    </label>
  );
}

/**
 * A text box that keeps what is typed while it is being typed, and reports it
 * on every change. Empty text is reported as undefined, which removes the key.
 */
export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  list,
  readOnly,
  label,
}: Readonly<{
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  list?: string;
  readOnly?: boolean;
  /** For a box with no label of its own next to it, such as a table cell. */
  label?: string;
}>) {
  return (
    <input
      id={id}
      aria-label={label}
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      list={list}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  );
}

/**
 * A number box. What is typed stays in the box while it is a number on its way
 * (a lone minus sign, say) or matches the value; otherwise the box shows the value.
 */
export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  label,
}: Readonly<{
  id?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  /** For a box with no label of its own next to it, such as a table cell. */
  label?: string;
}>) {
  const [typed, setTyped] = useState<string>();
  const shown = typed !== undefined && showsTyped(typed, value) ? typed : (value?.toString() ?? '');
  return (
    <input
      id={id}
      aria-label={label}
      type="text"
      inputMode="decimal"
      className="design-number"
      value={shown}
      placeholder={placeholder}
      onChange={(e) => {
        const text = e.target.value;
        setTyped(text);
        if (text.trim() === '') onChange(undefined);
        else if (Number.isFinite(Number(text))) onChange(Number(text));
      }}
    />
  );
}

/** Whether a number box should keep showing what was typed rather than its value. */
function showsTyped(typed: string, value: number | undefined): boolean {
  if (typed.trim() === '') return value === undefined;
  const number = Number(typed);
  return !Number.isFinite(number) || number === value;
}

/** Two numbers side by side, such as a position or a size; both are needed. */
export function PairInput({
  id,
  value,
  onChange,
  labels = ['x', 'y'],
}: Readonly<{
  id?: string;
  value: [number, number] | undefined;
  onChange: (value: [number, number] | undefined) => void;
  labels?: [string, string];
}>) {
  const [a, b] = value ?? [undefined, undefined];
  const set = (x: number | undefined, y: number | undefined) =>
    onChange(x === undefined && y === undefined ? undefined : [x ?? 0, y ?? 0]);
  return (
    <span className="design-pair">
      <NumberInput id={id} value={a} placeholder={labels[0]} onChange={(x) => set(x, b)} />
      <NumberInput value={b} placeholder={labels[1]} onChange={(y) => set(a, y)} />
    </span>
  );
}

/** A size: one number for a square or circle, or a width and height. */
export function SizeInput({
  id,
  value,
  onChange,
}: Readonly<{
  id?: string;
  value: number | [number, number] | undefined;
  onChange: (value: number | [number, number] | undefined) => void;
}>) {
  const pair: [number, number] | undefined = typeof value === 'number' ? [value, value] : value;
  return (
    <PairInput
      id={id}
      value={pair}
      labels={['width', 'height']}
      onChange={(next) => onChange(next && next[0] === next[1] ? next[0] : next)}
    />
  );
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  empty,
  labels,
  label,
}: Readonly<{
  id?: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
  /** Label for leaving the value out, when it may be left out. */
  empty?: string;
  /** What to show for each option, when not the value itself. */
  labels?: Partial<Record<T, string>>;
  /** For a drop-down with no label of its own next to it, such as the second of a row. */
  label?: string;
}>) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : (e.target.value as T))}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

/**
 * A colour: one of the project's named colours, none, transparent, a field's
 * colour (`{{field}}`) or any other, picked from a small picker. Fields are
 * offered only where the component being designed gives them; any other field
 * can still be typed as `{{field}}`.
 */
export function ColorInput({
  id,
  value,
  onChange,
  label,
  fields = false,
}: Readonly<{
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label?: string;
  /** Whether the open component's fields can give the colour. */
  fields?: boolean;
}>) {
  const colours: Record<string, string> = useStore((s) => s.view?.assets.colors ?? NO_COLOURS);
  const typeFields = useDesign((s) => s.draft?.fields);
  return (
    <ColourPicker
      id={id}
      label={label}
      value={value}
      colours={colours}
      fields={fields ? colourFields(typeFields) : []}
      onChange={onChange}
    />
  );
}

const NO_COLOURS: Record<string, string> = {};

/** The fields that can give a colour: colour fields, and fields with a list of choices. */
function colourFields(fields: ComponentType['fields']): string[] {
  return Object.entries(fields ?? {})
    .filter(([, field]) => ['color', 'enum'].includes(fieldSpec(field).type))
    .map(([name]) => name);
}
