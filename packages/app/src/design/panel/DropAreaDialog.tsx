// The dialog that asks which kind of drop area to add to a component.
import type { NewTargetKind } from '../canvas/snaps';
import { Dialog } from '../../ui/Dialog';

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

/** Picks the kind of drop area to add; closes on a pick, the cross, Escape or a click outside. */
export function DropAreaDialog({
  onPick,
  onClose,
}: Readonly<{ onPick: (kind: NewTargetKind) => void; onClose: () => void }>) {
  return (
    <Dialog title="Add a drop area" onClose={onClose}>
      <ul className="ui-picks">
        {DROP_AREA_KINDS.map(({ kind, name, about }) => (
          <li key={kind}>
            <button type="button" onClick={() => onPick(kind)}>
              <strong>{name}</strong>
              <small>{about}</small>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
