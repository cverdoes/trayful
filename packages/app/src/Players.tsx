import { handOf, type Piece } from '@trayful/core';
import { useState, type KeyboardEvent, type PointerEvent, type SubmitEvent } from 'react';
import { connect, join } from './connection';
import { Mark } from './Mark';
import { Thumbnail } from './render/Thumbnail';
import { HAND_DRAG, toggleHandTray } from './hand';
import { clampHandHeight, HAND_HEIGHT, handCardHeight, saveHandHeight } from './handTray';
import { useStore } from './store';
import { windowCentre } from './viewport';

/** How far one arrow key press moves the top edge of the hand tray, in pixels. */
const RESIZE_STEP = 16;

/** Asks for a name before someone with an invite sits down at the table. */
export function JoinScreen() {
  const me = useStore((s) => s.me);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await join(name);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="overlay">
      <form className="help join" onSubmit={(e) => void submit(e)}>
        <Mark size={96} />
        <h2>Join the table</h2>
        <p>Pick a name the other players will see. Cards in your hand stay hidden from them.</p>
        <input
          aria-label="Your name"
          autoFocus
          maxLength={40}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" disabled={busy || !name.trim()}>
            Join
          </button>
          {me?.player && (
            <button
              type="button"
              onClick={() => {
                useStore.setState({ gate: undefined });
                connect();
              }}
            >
              Play as {me.player.name}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** For someone who reached the server without an invite link. */
export function ClosedScreen() {
  return (
    <div className="loading">
      <div className="help">
        <Mark size={96} />
        <h2>This table is private</h2>
        <p>Ask the host for an invite link, and open it in this browser to join.</p>
      </div>
    </div>
  );
}

/** Everyone at the table, with how many cards each holds. */
export function PlayerList() {
  const players = useStore((s) => s.players);
  const hands = useStore((s) => s.table?.hands);
  const me = useStore((s) => s.me);
  const shown = players.filter((p) => p.online || hands?.[p.id]);
  if (!shown.length) return null;
  return (
    <ul className="players" aria-label="Players">
      {shown.map((p) => (
        <li
          key={p.id}
          className={p.online ? undefined : 'away'}
          title={`${p.name}${p.id === me?.player?.id ? ' (you)' : ''}${p.online ? '' : ', away'}${
            hands?.[p.id] ? `, ${hands[p.id]} in hand` : ''
          }. Give them cards with hand:${p.id}.`}
        >
          <span className="dot" style={{ background: p.color }} />
          {p.name}
          {p.id === me?.player?.id && <span className="muted"> (you)</span>}
          {hands?.[p.id] ? <span className="count">{hands[p.id]}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The player's private hand along the bottom of the screen. Drag cards from the
 * table onto it to take them; drag them out onto the table to play them (hold Alt
 * to play face down). No one else sees what is here. H shrinks it to a bubble in
 * the corner, which still takes cards dropped on it.
 */
export function HandTray() {
  const table = useStore((s) => s.table);
  const view = useStore((s) => s.view);
  const me = useStore((s) => s.me?.player?.id);
  const over = useStore((s) => s.overHand);
  const height = useStore((s) => s.handHeight);
  const minimized = useStore((s) => s.handMinimized);
  if (!table || !view || !me) return null;
  const hand = handOf(table, me);
  const className = `hand-tray${minimized ? ' minimized' : ''}${over ? ' over' : ''}`;
  if (minimized) {
    return (
      <section className={className} aria-label="Your hand" data-count={hand.length}>
        <HandBubble count={hand.length} />
      </section>
    );
  }
  return (
    <section
      className={className}
      aria-label="Your hand"
      data-count={hand.length}
      style={{ height }}
    >
      <ResizeHandle height={height} />
      <button
        type="button"
        className="hand-minimize"
        title="Shrink your hand to a bubble (H)"
        aria-label="Shrink your hand"
        onClick={toggleHandTray}
      >
        –
      </button>
      <div className="hand-cards">
        {hand.length === 0 ? (
          <p className="muted">
            Your hand: drag cards here to keep them hidden from the other players.
          </p>
        ) : (
          hand.map((piece) => (
            <HandCard key={piece.id} piece={piece} length={handCardHeight(height)} />
          ))
        )}
      </div>
    </section>
  );
}

/** The hand shrunk to the lower left corner: how many cards it holds. Click it to open the hand. */
function HandBubble({ count }: Readonly<{ count: number }>) {
  const cards = count === 1 ? '1 card' : `${count} cards`;
  return (
    <button
      type="button"
      className="hand-bubble"
      title={`Your hand: ${cards}. Click or press H to open it, or drop cards here.`}
      aria-label={`Open your hand, ${cards}`}
      onClick={toggleHandTray}
    >
      <span aria-hidden="true">✋</span>
      <span className="count">{count}</span>
    </button>
  );
}

/** Resizes the hand tray to fit this window and remembers the height for next time. */
function setHandHeight(height: number): void {
  const handHeight = clampHandHeight(height, window.innerHeight);
  useStore.setState({ handHeight });
  saveHandHeight(handHeight);
}

/** The top edge of the hand tray: drag it, or use the arrow keys, to make the tray taller or shorter. */
function ResizeHandle({ height }: Readonly<{ height: number }>) {
  const [start, setStart] = useState<{ y: number; height: number }>();
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart({ y: e.clientY, height });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start) setHandHeight(start.height + start.y - e.clientY);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: RESIZE_STEP, ArrowDown: -RESIZE_STEP }[e.key];
    if (step === undefined) return;
    // Keep the arrow keys from also reaching the table's shortcuts.
    e.preventDefault();
    e.stopPropagation();
    setHandHeight(height + step);
  };
  return (
    <div
      className={`hand-resize${start ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize your hand"
      aria-valuenow={height}
      tabIndex={0}
      title="Drag to resize your hand, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setStart(undefined)}
      onPointerCancel={() => setStart(undefined)}
      onDoubleClick={() => setHandHeight(HAND_HEIGHT)}
      onKeyDown={onKeyDown}
    />
  );
}

function HandCard({ piece, length }: Readonly<{ piece: Piece; length: number }>) {
  const play = () => {
    // Double-click plays the card into the middle of the view.
    const [x, y] = windowCentre();
    useStore
      .getState()
      .command({ type: 'move', ids: [piece.id], to: [Math.round(x), Math.round(y)] });
  };
  return (
    <div
      className="hand-card"
      draggable
      title="Drag onto the table to play it (hold Alt for face down), or double-click"
      data-id={piece.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(HAND_DRAG, piece.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDoubleClick={play}
    >
      <Thumbnail piece={piece} length={length} face="up" />
    </div>
  );
}
