import { useStore } from './store';

const SHORTCUTS: [string, string][] = [
  ['Drag', 'Move a piece, or take the top card off a pile'],
  ['Drag onto a pile', 'Put cards or tiles on top of it'],
  ['Drag near a board spot', 'Snap into it; pieces on a board move with the board'],
  ['Drag a card in a fan or spread', 'Take that card out of the pile'],
  ['Shift + drag a pile', 'Move the whole pile'],
  ['Click / Shift + click', 'Select / add to the selection'],
  ['Click a piece in a group', 'Pick which of the pieces sharing that spot to take'],
  ['Shift + drag on the table', 'Select everything in a box'],
  ['Drag on the table', 'Pan'],
  ['Wheel', 'Zoom (over a counter: change its number)'],
  ['Double-click', 'Flip a card, or roll a die'],
  ['Drag onto your hand', 'Keep cards hidden from the other players, along the bottom'],
  ['Drag out of your hand', 'Play a card face up; hold Alt to play it face down'],
  ['Double-click in your hand', 'Play that card into the middle of the view'],
  ['F', 'Flip'],
  ['Q / E', 'Rotate left / right'],
  ['D', 'Draw the top card of the selected pile'],
  ['S', 'Shuffle the selected pile'],
  ['V', 'Show the selected pile as a pile, a fan or spread out'],
  ['R', 'Roll the selected dice'],
  ['+ / −', 'Change the selected counters'],
  ['L', 'Lock or unlock'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo your own last move'],
  ['0', 'Fit the table to the window'],
  ['Esc', 'Close the group list, or clear the selection'],
];

/** The mouse and keyboard controls of the table. */
export function Help() {
  const close = () => useStore.setState({ helpOpen: false });
  return (
    <div className="overlay" onClick={close}>
      <div className="help" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <h2>Playing on the table</h2>
        <table>
          <tbody>
            {SHORTCUTS.map(([keys, what]) => (
              <tr key={keys}>
                <th>{keys}</th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Every change is saved to the project&apos;s <code>tables/</code> folder as you play.
        </p>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
