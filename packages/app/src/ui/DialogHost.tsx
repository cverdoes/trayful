// Draws the question that `confirm` or `ask` has open.
import { useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { useDialogs, type OpenDialog } from './dialogs';
import { Field } from './Field';

/** The question open now, as a dialog. Sits once at the top of the app. */
export function DialogHost() {
  const open = useDialogs((s) => s.open);
  if (!open) return null;
  return open.kind === 'confirm' ? (
    <ConfirmDialog open={open} />
  ) : (
    <AskDialog key={open.question.title} open={open} />
  );
}

function ConfirmDialog({ open }: Readonly<{ open: Extract<OpenDialog, { kind: 'confirm' }> }>) {
  const { title, text, action, danger } = open.question;
  return (
    <Dialog
      title={title}
      size="sm"
      onClose={() => open.answer(false)}
      actions={
        <>
          {/* What removes something does not start with the focus, so Enter alone does not remove. */}
          <Button onClick={() => open.answer(false)} data-focus={danger ? '' : undefined}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => open.answer(true)}
            data-focus={danger ? undefined : ''}
          >
            {action}
          </Button>
        </>
      }
    >
      {text && <p>{text}</p>}
    </Dialog>
  );
}

function AskDialog({ open }: Readonly<{ open: Extract<OpenDialog, { kind: 'ask' }> }>) {
  const { title, text, label, value = '', action = 'OK', allowEmpty } = open.question;
  const [typed, setTyped] = useState(value);
  const answerable = allowEmpty === true || typed.trim() !== '';
  return (
    <Dialog
      title={title}
      size="sm"
      onClose={() => open.answer(undefined)}
      onSubmit={() => {
        if (answerable) open.answer(typed);
      }}
      actions={
        <>
          <Button onClick={() => open.answer(undefined)}>Cancel</Button>
          <Button variant="primary" submit disabled={!answerable}>
            {action}
          </Button>
        </>
      }
    >
      {text && <p>{text}</p>}
      <Field label={label}>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </Dialog>
  );
}
