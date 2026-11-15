// The dialog that changes what a component is: a piece, a zone, a die, a counter or a stamp.
import { REPRESENTATIONS, type ComponentType } from '@trayful/formats/browser';
import { Dialog } from '../../ui/Dialog';
import { KIND_TEXT } from '../kinds';

/**
 * Picks another kind for the component; closes on a pick, the cross, Escape or a
 * click outside. The kind it is now is marked, and picking it changes nothing.
 */
export function KindDialog({
  type,
  onPick,
  onClose,
}: Readonly<{
  type: ComponentType;
  onPick: (is: ComponentType['is']) => void;
  onClose: () => void;
}>) {
  return (
    <Dialog title={`Change what "${type.name ?? type.id}" is`} onClose={onClose}>
      <ul className="ui-picks">
        {REPRESENTATIONS.map((is) => (
          <li key={is}>
            <button
              type="button"
              aria-current={type.is === is}
              className={type.is === is ? 'chosen' : undefined}
              onClick={() => (type.is === is ? onClose() : onPick(is))}
            >
              <strong>{KIND_TEXT[is].name}</strong>
              {type.is === is && <span className="ui-picks-tag">now</span>}
              <small>{KIND_TEXT[is].about}</small>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">Settings the new kind cannot use are dropped. Undo brings them back.</p>
    </Dialog>
  );
}
