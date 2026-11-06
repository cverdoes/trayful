import { picks, type PlayerPrompt } from '@trayful/core';
import { useStore } from '../store';

/** The prompt on show, which the table and the hand answer clicks for. */
function promptOnShow(): PlayerPrompt | undefined {
  return useStore.getState().prompts[0];
}

/** Whether pieces, or places, are what the prompt on show asks the player to click. */
export function asksFor(prompt: PlayerPrompt | undefined, what: 'pick' | 'place'): boolean {
  return prompt?.kind === what;
}

/** What lights up for a prompt: what may be picked, what it points at, what it highlights. */
export function promptMarks(prompt: PlayerPrompt | undefined): Set<string> {
  if (!prompt) return new Set();
  return new Set([
    ...(prompt.candidates ?? []),
    ...(prompt.anchor ? [prompt.anchor] : []),
    ...(prompt.highlight ?? []),
  ]);
}

/**
 * A click on a piece or place while a prompt asks for one: picks it, or takes it back.
 * When the prompt wants exactly one, the click answers it. Returns whether the click
 * was for the prompt, so the table does not also select what was clicked.
 */
export function clickForPrompt(id: string, what: 'pick' | 'place'): boolean {
  const prompt = promptOnShow();
  if (!prompt || !asksFor(prompt, what) || !prompt.candidates?.includes(id)) return false;
  const { min, max } = picks(prompt);
  const { picked, send } = useStore.getState();
  if (min === 1 && max === 1) {
    send({ type: 'answer', prompt: prompt.id, answer: [id] });
    return true;
  }
  if (picked.includes(id)) useStore.setState({ picked: picked.filter((p) => p !== id) });
  else if (picked.length < max) useStore.setState({ picked: [...picked, id] });
  return true;
}
