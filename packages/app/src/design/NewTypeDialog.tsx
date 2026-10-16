import { REPRESENTATIONS, TYPE_PRESETS, type ComponentType } from '@trayful/formats/browser';
import { useState } from 'react';
import { SizeInput } from './controls';
import { KIND_TEXT } from './kinds';
import { createType, useDesign } from './store';

type Start = Omit<ComponentType, 'id'>;

/**
 * A new component in two steps: its name and size (from a common one to start
 * like), then what it is. Everything else is added in the panel afterwards.
 */
export function NewTypeDialog() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(0);
  const [size, setSize] = useState<Start['size']>(TYPE_PRESETS[0]!.type.size);
  const [is, setIs] = useState<Start['is']>(TYPE_PRESETS[0]!.type.is);
  const close = () => useDesign.setState({ newTypeOpen: false });
  const pick = (i: number) => {
    setPreset(i);
    setSize(TYPE_PRESETS[i]!.type.size);
    setIs(TYPE_PRESETS[i]!.type.is);
  };
  const create = () =>
    void createType(startFrom(TYPE_PRESETS[preset]!.type, size, is), name.trim());
  return (
    <div className="overlay" onClick={close}>
      <form
        className="help new-type"
        role="dialog"
        aria-label="New component"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 1) setStep(2);
          else create();
        }}
      >
        <h2>New component</h2>
        {step === 1 ? (
          <NameStep {...{ name, setName, preset, pick, size, setSize }} />
        ) : (
          <KindStep is={is} setIs={setIs} />
        )}
        <div className="row">
          <button type="button" onClick={step === 1 ? close : () => setStep(1)}>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <button type="submit" disabled={!name.trim()}>
            {step === 1 ? 'Next' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * What a new component starts as: the preset, at the size given. Made another
 * kind of thing than the preset, it starts plain, as nothing of the preset fits.
 */
function startFrom(preset: Start, size: Start['size'], is: Start['is']): Start {
  return preset.is === is ? { ...preset, size } : { size, is };
}

function NameStep({
  name,
  setName,
  preset,
  pick,
  size,
  setSize,
}: Readonly<{
  name: string;
  setName: (name: string) => void;
  preset: number;
  pick: (preset: number) => void;
  size: Start['size'];
  setSize: (size: Start['size']) => void;
}>) {
  return (
    <>
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
        <legend>Start like</legend>
        {TYPE_PRESETS.map((p, i) => (
          <label key={p.name} className="design-preset">
            <input type="radio" name="preset" checked={i === preset} onChange={() => pick(i)} />{' '}
            {p.name}
          </label>
        ))}
      </fieldset>
      <label className="design-new-size">
        Size (mm){' '}
        <SizeInput value={size} onChange={(next) => next !== undefined && setSize(next)} />
      </label>
    </>
  );
}

function KindStep({ is, setIs }: Readonly<{ is: Start['is']; setIs: (is: Start['is']) => void }>) {
  return (
    <fieldset>
      <legend>What is it?</legend>
      {REPRESENTATIONS.map((kind) => (
        <label key={kind} className="design-kind-choice">
          <input type="radio" name="is" checked={kind === is} onChange={() => setIs(kind)} />{' '}
          <strong>{KIND_TEXT[kind].name}</strong>{' '}
          <span className="muted">{KIND_TEXT[kind].about}</span>
        </label>
      ))}
    </fieldset>
  );
}
