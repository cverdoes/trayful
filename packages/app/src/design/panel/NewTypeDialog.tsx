import { REPRESENTATIONS, TYPE_PRESETS, type ComponentType } from '@trayful/formats/browser';
import { useState } from 'react';
import { SizeInput } from './controls';
import { KIND_TEXT } from '../kinds';
import { createType, useDesign } from '../store';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';

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
    <Dialog
      title="New component"
      onClose={close}
      onSubmit={step === 1 ? () => setStep(2) : create}
      actions={
        <>
          <Button onClick={step === 1 ? close : () => setStep(1)}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button variant="primary" submit disabled={!name.trim()}>
            {step === 1 ? 'Next' : 'Create'}
          </Button>
        </>
      }
    >
      {step === 1 ? (
        <NameStep {...{ name, setName, preset, pick, size, setSize }} />
      ) : (
        <KindStep is={is} setIs={setIs} />
      )}
    </Dialog>
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
      <Field label="Name">
        <input
          type="text"
          value={name}
          placeholder="Event card"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <fieldset className="ui-choices ui-choices-2">
        <legend>Start like</legend>
        {TYPE_PRESETS.map((p, i) => (
          <label key={p.name}>
            <input type="radio" name="preset" checked={i === preset} onChange={() => pick(i)} />
            {p.name}
          </label>
        ))}
      </fieldset>
      <div className="ui-field">
        <span className="ui-field-label">Size (mm)</span>
        <SizeInput value={size} onChange={(next) => next !== undefined && setSize(next)} />
      </div>
    </>
  );
}

function KindStep({ is, setIs }: Readonly<{ is: Start['is']; setIs: (is: Start['is']) => void }>) {
  return (
    <fieldset className="ui-choices">
      <legend>What is it?</legend>
      {REPRESENTATIONS.map((kind) => (
        <label key={kind}>
          <input
            type="radio"
            name="is"
            checked={kind === is}
            data-focus={kind === is ? '' : undefined}
            onChange={() => setIs(kind)}
          />
          <span>
            <strong>{KIND_TEXT[kind].name}</strong>
            <small>{KIND_TEXT[kind].about}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
