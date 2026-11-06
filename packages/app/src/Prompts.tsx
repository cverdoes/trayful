import type { PromptAnswer } from '@trayful/core';
import type { CSSProperties } from 'react';
import { Answers } from './PromptAnswers';
import { useStore } from './store';
import { anchorOnScreen, bubbleAt } from './table/promptBubble';

/** Room between the prompt panel and the hand tray, or the bottom of the window. */
const GAP = 12;
/** Where the panel sits when the hand is a bubble in the corner, or not shown. */
const LOW = 80;

/**
 * The oldest question or message waiting for this player. It shows in a panel above
 * their hand, or, when it points at a piece or place on the table, in a bubble next
 * to it. Answering it brings up the next one.
 */
export function Prompts() {
  const prompts = useStore((s) => s.prompts);
  const prompt = prompts[0];
  const at = useStore((s) => (prompt ? anchorOnScreen(prompt, s) : undefined));
  const bottom = useStore((s) => (s.handMinimized ? LOW : s.handHeight + GAP));
  if (!prompt) return null;
  const answer = (value: PromptAnswer) =>
    useStore.getState().send({ type: 'answer', prompt: prompt.id, answer: value });
  const style: CSSProperties = at ? bubbleAt(at, window.innerWidth) : { bottom };
  return (
    <section
      className={`prompt${at ? ' bubble' : ''}`}
      role="dialog"
      aria-label={prompt.title ?? `${prompt.from} asks`}
      style={style}
    >
      <header>
        <span className="prompt-from">{prompt.from}</span>
        {prompt.title && <strong>{prompt.title}</strong>}
        {prompts.length > 1 && <span className="muted">1 of {prompts.length}</span>}
      </header>
      <p>{prompt.text}</p>
      {/* A new prompt starts with nothing picked or typed. */}
      <Answers key={prompt.id} prompt={prompt} answer={answer} />
    </section>
  );
}
