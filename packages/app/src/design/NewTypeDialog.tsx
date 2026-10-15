import { TYPE_PRESETS } from '@trayful/formats/browser';
import { useState } from 'react';
import { createType, useDesign } from './store';

/** Asks for a name and a common component to start a new type from. */
export function NewTypeDialog() {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(0);
  const close = () => useDesign.setState({ newTypeOpen: false });
  const create = () => {
    if (name.trim()) void createType(TYPE_PRESETS[preset]!.type, name.trim());
  };
  return (
    <div className="overlay" onClick={close}>
      <form
        className="help new-type"
        role="dialog"
        aria-label="New type"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h2>New type</h2>
        <label>
          Name{' '}
          <input
            autoFocus
            value={name}
            placeholder="Event card"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Start from</legend>
          {TYPE_PRESETS.map((p, i) => (
            <label key={p.name} className="design-preset">
              <input
                type="radio"
                name="preset"
                checked={i === preset}
                onChange={() => setPreset(i)}
              />{' '}
              {p.name}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
