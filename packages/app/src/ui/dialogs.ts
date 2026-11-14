// Questions any code can put to the person in a dialog: a yes or no, or a line of text.
import { create } from 'zustand';

/** A yes-or-no question. `action` names the button that says yes, such as "Delete". */
export interface Confirmation {
  title: string;
  /** What saying yes does, when the title does not say it all. */
  text?: string;
  action: string;
  /** Whether saying yes removes something, so the button warns. */
  danger?: boolean;
}

/** A question answered with a line of text. */
export interface Question {
  title: string;
  text?: string;
  /** The name of the box the answer is typed in. */
  label: string;
  /** What the box starts with. */
  value?: string;
  /** The name of the button that gives the answer; "OK" when left out. */
  action?: string;
  /** Whether an empty answer is one. Otherwise the answer cannot be given until something is typed. */
  allowEmpty?: boolean;
}

/** The question open now, and how its answer gets back to who asked. */
export type OpenDialog =
  | { kind: 'confirm'; question: Confirmation; answer: (yes: boolean) => void }
  | { kind: 'ask'; question: Question; answer: (text: string | undefined) => void };

/** The question on screen, if any. `DialogHost` draws it. */
export const useDialogs = create<{ open?: OpenDialog }>(() => ({}));

/** Asks a yes-or-no question. Closing the dialog says no. */
export function confirm(question: Confirmation): Promise<boolean> {
  return new Promise((resolve) => {
    show({ kind: 'confirm', question, answer: closing(resolve) });
  });
}

/** Asks for a line of text, trimmed. Gives nothing when the person backs out. */
export function ask(question: Question): Promise<string | undefined> {
  return new Promise((resolve) => {
    show({
      kind: 'ask',
      question,
      answer: closing((text: string | undefined) => resolve(text?.trim())),
    });
  });
}

/** Shows a question. One already open is backed out of first. */
function show(next: OpenDialog): void {
  const { open } = useDialogs.getState();
  if (open?.kind === 'confirm') open.answer(false);
  else open?.answer(undefined);
  useDialogs.setState({ open: next });
}

/** An answer that also takes the dialog away. */
function closing<T>(resolve: (value: T) => void): (value: T) => void {
  return (value) => {
    useDialogs.setState({ open: undefined });
    resolve(value);
  };
}
