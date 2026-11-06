import { picks, rangeText, type PlayerPrompt, type PromptAnswer } from '@trayful/core';
import { useState, type SubmitEvent } from 'react';
import { useStore } from './store';

export interface AnswersProps {
  prompt: PlayerPrompt;
  answer: (value: PromptAnswer) => void;
}

/** The buttons and fields a prompt is answered with, by kind. */
export function Answers({ prompt, answer }: Readonly<AnswersProps>) {
  switch (prompt.kind) {
    case 'message':
      return (
        <div className="prompt-actions">
          <button type="button" className="primary" onClick={() => answer(true)}>
            OK
          </button>
        </div>
      );
    case 'confirm':
      return (
        <div className="prompt-actions">
          <button type="button" onClick={() => answer(false)}>
            No
          </button>
          <button type="button" className="primary" onClick={() => answer(true)}>
            Yes
          </button>
        </div>
      );
    case 'choice': {
      const { min, max } = picks(prompt);
      return min === 1 && max === 1 ? (
        <PickOne prompt={prompt} answer={answer} />
      ) : (
        <PickSeveral prompt={prompt} answer={answer} />
      );
    }
    case 'pick':
    case 'place':
      return <PickOnTable prompt={prompt} answer={answer} />;
    case 'number':
    case 'text':
      return <TypeIn prompt={prompt} answer={answer} />;
  }
}

/** One button per option: a click answers. */
function PickOne({ prompt, answer }: Readonly<AnswersProps>) {
  return (
    <div className="prompt-actions">
      {prompt.options?.map((option) => (
        <button key={option.id} type="button" onClick={() => answer([option.id])}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A box per option, and Done once the right number are ticked. */
function PickSeveral({ prompt, answer }: Readonly<AnswersProps>) {
  const [picked, setPicked] = useState<string[]>([]);
  const { max } = picks(prompt);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <ul className="prompt-options">
        {prompt.options?.map((option) => (
          <li key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(option.id)}
                disabled={!picked.includes(option.id) && picked.length >= max}
                onChange={() => toggle(option.id)}
              />
              {option.label}
            </label>
          </li>
        ))}
      </ul>
      <Done prompt={prompt} picked={picked} answer={answer} />
    </>
  );
}

/**
 * Pieces or places are picked on the table, or pieces in the hand, where they glow.
 * One to pick is answered by the click itself; several need Done.
 */
function PickOnTable({ prompt, answer }: Readonly<AnswersProps>) {
  const picked = useStore((s) => s.picked);
  const { min, max } = picks(prompt);
  const where = prompt.kind === 'place' ? 'a place' : 'a piece';
  if (min === 1 && max === 1) {
    return <p className="muted prompt-hint">Click {where} that glows gold.</p>;
  }
  return <Done prompt={prompt} picked={picked} answer={answer} />;
}

/** How many to pick, and Done once that many are picked. */
function Done({ prompt, picked, answer }: Readonly<AnswersProps & { picked: string[] }>) {
  const { min, max } = picks(prompt);
  return (
    <div className="prompt-actions">
      <span className="muted">
        {min === max ? `Pick ${min}` : `Pick ${min} to ${max}`} ({picked.length} picked)
      </span>
      <button
        type="button"
        className="primary"
        disabled={picked.length < min || picked.length > max}
        onClick={() => answer(picked)}
      >
        Done
      </button>
    </div>
  );
}

/** A field to type a number or a few words into. */
function TypeIn({ prompt, answer }: Readonly<AnswersProps>) {
  const [value, setValue] = useState('');
  const number = prompt.kind === 'number';
  const parsed = number ? Number(value) : value;
  const valid = number
    ? value.trim() !== '' && Number.isInteger(parsed) && inRange(prompt, parsed as number)
    : value.trim() !== '';
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (valid) answer(parsed);
  };
  return (
    <form className="prompt-actions" onSubmit={submit}>
      {number && <span className="muted">A whole number {rangeText(prompt.min, prompt.max)}</span>}
      <input
        aria-label="Your answer"
        type={number ? 'number' : 'text'}
        {...(number ? { min: prompt.min, max: prompt.max, step: 1 } : { maxLength: 500 })}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="primary" disabled={!valid}>
        OK
      </button>
    </form>
  );
}

function inRange({ min, max }: PlayerPrompt, n: number): boolean {
  return (min === undefined || n >= min) && (max === undefined || n <= max);
}
