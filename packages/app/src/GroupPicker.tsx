import { pickEntries, pickerCorner, raise } from './groups';
import { Thumbnail } from './render/Thumbnail';
import { useStore } from './store';

/** Length of the longer side of each piece in the picker, in pixels. */
const THUMB = 48;

/**
 * The pieces of a crowded group spot, listed beside where it was clicked: picking
 * one selects it and brings it to the top, ready to drag.
 */
export function GroupPicker() {
  const pick = useStore((s) => s.groupPick);
  const table = useStore((s) => s.table);
  if (!pick || !table) return null;
  const close = () => useStore.setState({ groupPick: undefined });
  const choose = (id: string) => {
    const { command, select } = useStore.getState();
    command(raise(id, pick.spot));
    select([id]);
    close();
  };
  const corner = pickerCorner(pick.at, { width: window.innerWidth, height: window.innerHeight });
  return (
    <div className="picker-backdrop" onClick={close}>
      <ul
        className="group-picker"
        role="listbox"
        aria-label={`Pieces on ${pick.spot}`}
        style={{ left: corner.x, top: corner.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {pickEntries(table, pick).map(({ id, piece }) => (
          <li key={id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              data-id={id}
              onClick={() => choose(id)}
            >
              <Thumbnail piece={piece} length={THUMB} />
              <span>{id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
