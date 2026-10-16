import { REPRESENTATIONS, type ComponentType } from '@trayful/formats/browser';
import { useId, useState, type KeyboardEvent } from 'react';

/** Something a picker offers: the id it stores and what a person reads. */
export interface PickOption {
  value: string;
  label: string;
}

/**
 * Picks several components from a list: each one picked is a chip that can be
 * removed, and the box suggests the rest as you type their name or id.
 * Nothing picked is reported as undefined, which removes the key.
 */
export function ComponentPicker({
  id,
  value = [],
  options,
  placeholder,
  onChange,
}: Readonly<{
  id?: string;
  value: string[] | undefined;
  options: PickOption[];
  placeholder?: string;
  onChange: (value: string[] | undefined) => void;
}>) {
  const listId = useId();
  const [typed, setTyped] = useState('');
  const left = options.filter((o) => !value.includes(o.value));
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const set = (next: string[]) => onChange(next.length ? next : undefined);
  const add = (option: PickOption) => {
    set([...value, option.value]);
    setTyped('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const match = findOption(left, typed);
      if (match) add(match);
    } else if (e.key === 'Backspace' && typed === '' && value.length) {
      set(value.slice(0, -1));
    }
  };

  return (
    <div className="picker">
      {value.map((v) => (
        <span key={v} className="picker-chip">
          {labelOf(v)}
          <button
            type="button"
            aria-label={`Remove ${labelOf(v)}`}
            onClick={() => set(value.filter((x) => x !== v))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        list={listId}
        value={typed}
        placeholder={value.length ? undefined : placeholder}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const text = e.target.value;
          // Choosing a suggestion replaces the text with its id: take it at once.
          const chosen = left.find((o) => o.value === text);
          if (chosen && (e.nativeEvent as InputEvent).inputType !== 'insertText') add(chosen);
          else setTyped(text);
        }}
      />
      <datalist id={listId}>
        {left.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}

/** The option a person typed: its id, or its name, ignoring case; or the only one that starts so. */
export function findOption(options: PickOption[], text: string): PickOption | undefined {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return undefined;
  const exact = options.find(
    (o) => o.value.toLowerCase() === wanted || o.label.toLowerCase() === wanted,
  );
  if (exact) return exact;
  const starts = options.filter(
    (o) => o.value.toLowerCase().startsWith(wanted) || o.label.toLowerCase().startsWith(wanted),
  );
  return starts.length === 1 ? starts[0] : undefined;
}

/** No components yet, kept as one object so a store selector returns the same one each time. */
export const NO_TYPES: Record<string, ComponentType> = {};

/** Components as options, by name, leaving out those `keep` turns down. */
export function componentOptions(
  types: Record<string, ComponentType>,
  keep: (type: ComponentType) => boolean = () => true,
): PickOption[] {
  return Object.values(types)
    .filter(keep)
    .map((t) => ({ value: t.id, label: t.name ?? t.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const ANY: Record<(typeof REPRESENTATIONS)[number], string> = {
  piece: 'Any piece',
  zone: 'Any zone',
  die: 'Any die',
  counter: 'Any counter',
};

/** What a drop area can accept: any component of a kind, or particular components. */
export function acceptOptions(types: Record<string, ComponentType>): PickOption[] {
  return [
    ...REPRESENTATIONS.map((is) => ({ value: is, label: ANY[is] })),
    ...componentOptions(types),
  ];
}
