import { picks, type PlayerPrompt, type PromptAnswer } from '@trayful/core';
import { useState } from 'react';
import { useStore } from './store';

/** Room between the prompt panel and the hand tray, or the bottom of the window. */
const GAP = 12;
/** Where the panel sits when the hand is a bubble in the corner, or not shown. */
const LOW = 80;

/**
 * The oldest question or message waiting for this player, in a panel above their hand.
 * Answering it brings up the next one.
 */
export function Prompts() {
  const prompts = useStore((s) => s.prompts);
  const handHeight = useStore((s) => s.handHeight);
  const minimized = useStore((s) => s.handMinimized);
  const prompt = prompts[0];
  if (!prompt) return null;
  const answer = (value: PromptAnswer) =>
    useStore.getState().send({ type: 'answer', prompt: prompt.id, answer: value });
  return (
    <section
      className="prompt"
      role="dialog"
      aria-label={prompt.title ?? `${prompt.from} asks`}
      style={{ bottom: minimized ? LOW : handHeight + GAP }}
    >
      <header>
        <span className="prompt-from">{prompt.from}</span>
        {prompt.title && <strong>{prompt.title}</strong>}
        {prompts.length > 1 && <span className="muted">1 of {prompts.length}</span>}
      </header>
      <p>{prompt.text}</p>
      {/* A new prompt starts with nothing picked. */}
      <Answers key={prompt.id} prompt={prompt} answer={answer} />
    </section>
  );
}

interface AnswersProps {
  prompt: PlayerPrompt;
  answer: (value: PromptAnswer) => void;
}

function Answers({ prompt, answer }: Readonly<AnswersProps>) {
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
  const { min, max } = picks(prompt);
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
      <div className="prompt-actions">
        <span className="muted">{min === max ? `Pick ${min}` : `Pick ${min} to ${max}`}</span>
        <button
          type="button"
          className="primary"
          disabled={picked.length < min || picked.length > max}
          onClick={() => answer(picked)}
        >
          Done
        </button>
      </div>
    </>
  );
}
