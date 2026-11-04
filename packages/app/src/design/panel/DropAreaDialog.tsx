import type { NewTargetKind } from './snaps';

/** The kinds of drop area to add, in the order offered, each with what it is for. */
export const DROP_AREA_KINDS: readonly { kind: NewTargetKind; name: string; about: string }[] = [
  { kind: 'grid', name: 'Grid', about: 'Spots in rows and columns, one thing on each.' },
  {
    kind: 'points',
    name: 'Points',
    about: 'Spots placed anywhere, one thing on each, like a track.',
  },
  { kind: 'area', name: 'Area', about: 'A box where things stay where they are dropped.' },
  { kind: 'pile', name: 'Stack', about: 'One spot where things pile up, like a draw deck.' },
  {
    kind: 'group',
    name: 'Group',
    about: 'One spot where things gather side by side, and any can be picked.',
  },
  { kind: 'row', name: 'Row', about: 'A box that lines things up left to right.' },
  { kind: 'bag', name: 'Bag', about: 'A box whose contents are hidden and drawn at random.' },
  {
    kind: 'stamp',
    name: 'Stamp boxes',
    about: 'Boxes to tick with a stamp, like a score sheet.',
  },
  { kind: 'text', name: 'Text box', about: 'A box players write in, like a score.' },
];

/** Picks the kind of drop area to add; closes on a pick, Cancel, Escape or a click outside. */
export function DropAreaDialog({
  onPick,
  onClose,
}: Readonly<{ onPick: (kind: NewTargetKind) => void; onClose: () => void }>) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="help drop-area-dialog"
        role="dialog"
        aria-label="Add a drop area"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2>Add a drop area</h2>
        <ul>
          {DROP_AREA_KINDS.map(({ kind, name, about }, i) => (
            <li key={kind}>
              <button type="button" autoFocus={i === 0} onClick={() => onPick(kind)}>
                <strong>{name}</strong> <span className="muted">{about}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
