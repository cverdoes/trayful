import { MAX_MARK_TEXT, type Piece } from '@trayful/core';
import { useState } from 'react';
import { pickerCorner } from './groups';
import { textCommand, type MarkPick } from './marks';
import { Thumbnail } from './render/Thumbnail';
import { useStore } from './store';

/** Length of the longer side of each stamp in the picker, in pixels. */
const THUMB = 40;

/**
 * Opens beside a clicked stamp or text box: the stamps it takes, to pick one, or
 * a field for its text. A click outside or Escape closes it.
 */
export function MarkDialog() {
  const pick = useStore((s) => s.markPick);
  if (!pick) return null;
  const corner = pickerCorner(pick.screen, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return (
    <div className="picker-backdrop" onClick={closeMarkDialog}>
      <div
        className="group-picker mark-dialog"
        style={{ left: corner.x, top: corner.y }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeMarkDialog();
        }}
      >
        {pick.stamps.length > 0 ? <StampChoices pick={pick} /> : <TextForm pick={pick} />}
      </div>
    </div>
  );
}

function closeMarkDialog() {
  useStore.setState({ markPick: undefined });
}

function StampChoices({ pick }: Readonly<{ pick: MarkPick }>) {
  const view = useStore((s) => s.view);
  const choose = (stamp: string) => {
    useStore.getState().command({ type: 'mark', at: pick.at, stamp });
    closeMarkDialog();
  };
  return (
    <ul role="listbox" aria-label={`Stamps for ${pick.at}`}>
      {pick.stamps.map((id, i) => (
        <li key={id}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            data-id={id}
            autoFocus={i === 0}
            onClick={() => choose(id)}
          >
            <Thumbnail piece={stampPiece(id)} length={THUMB} />
            <span>{view?.types[id]?.name ?? id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TextForm({ pick }: Readonly<{ pick: MarkPick }>) {
  const [text, setText] = useState(pick.text ?? '');
  return (
    <form
      aria-label={`Text for ${pick.at}`}
      onSubmit={(e) => {
        e.preventDefault();
        const command = textCommand(pick, text);
        if (command) useStore.getState().command(command);
        closeMarkDialog();
      }}
    >
      <input
        type="text"
        aria-label="Text"
        value={text}
        maxLength={MAX_MARK_TEXT}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">OK</button>
    </form>
  );
}

/** A stamp drawn as if it were a piece, for its picture in the picker. */
function stampPiece(type: string): Piece {
  return { kind: 'piece', id: type, type, pos: [0, 0], rot: 0, face: 'up', z: 0, locked: true };
}
