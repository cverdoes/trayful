import { handOf, type Piece } from '@trayful/core';
import { useEffect, useState, type SubmitEvent } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { connect, join } from './connection';
import { Component } from './render/Component';
import { sizeOf } from './render/geometry';
import { useStore } from './store';

/** Data a hand card carries while dragged onto the table. */
export const HAND_DRAG = 'application/x-trayful-hand';
/** Height of a card in the hand tray, in pixels. */
const CARD_HEIGHT = 92;

/** The id of the player this browser plays as. */
export function myId(): string | undefined {
  return useStore.getState().me?.player?.id;
}

/** Whether a screen point lies over the hand tray. */
export function overHandTray(clientX: number, clientY: number): boolean {
  const tray = document.querySelector('.hand-tray')?.getBoundingClientRect();
  return (
    !!tray &&
    clientX >= tray.left &&
    clientX <= tray.right &&
    clientY >= tray.top &&
    clientY <= tray.bottom
  );
}

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

/** Makes (or with `renew`, replaces) the invite link to one table. */
async function fetchInvite(project: string, table: string, renew = false): Promise<string[]> {
  const response = await fetch('/api/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, table, renew }),
  });
  const body = (await response.json()) as { links?: string[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body.links ?? [];
}

/**
 * The host's invite links to one table, to send to playtesters. Starts on the table
 * open in this window; another can be picked. A link lets people into that table only.
 */
export function InviteDialog() {
  const view = useStore((s) => s.view);
  const [tables, setTables] = useState<{ project: string; name: string; tables: string[] }[]>([]);
  const [chosen, setChosen] = useState(view ? `${view.project}/${view.table}` : '');
  const [links, setLinks] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const [renewed, setRenewed] = useState(false);
  const close = () => useStore.setState({ inviteOpen: false });
  const [project, table] = chosen.split('/') as [string, string];

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((list: { id: string; name: string; tables: string[] }[]) =>
        setTables(list.map((p) => ({ project: p.id, name: p.name, tables: p.tables }))),
      )
      .catch(() => {
        // Without the list the dialog still offers the open table.
      });
  }, []);
  useEffect(() => {
    if (!project || !table) return;
    setLinks(undefined);
    setCopied(undefined);
    setRenewed(false);
    fetchInvite(project, table)
      .then(setLinks)
      .catch((err: unknown) => setError(messageOf(err)));
  }, [project, table]);

  const renew = () => {
    if (
      !window.confirm(
        `Make a new link to ${table}? The old link stops working. Players who already joined keep their seat.`,
      )
    )
      return;
    fetchInvite(project, table, true)
      .then((l) => {
        setLinks(l);
        setCopied(undefined);
        setRenewed(true);
      })
      .catch((err: unknown) => setError(messageOf(err)));
  };
  // The clipboard is missing on plain-http pages, such as an invite opened over the LAN.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const copy = (link: string) => void clipboard?.writeText(link).then(() => setCopied(link));

  return (
    <div className="overlay" onClick={close}>
      <div
        className="help invite"
        role="dialog"
        aria-label="Invite players"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Invite players</h2>
        <label className="row">
          <span>Table</span>
          <select
            aria-label="Table to invite to"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            {(tables.length ? tables : [{ project, name: project, tables: [table] }]).map((p) => (
              <optgroup key={p.project} label={p.name}>
                {p.tables.map((t) => (
                  <option key={t} value={`${p.project}/${t}`}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        {links?.length === 0 && (
          <p>
            This table is only reachable from your computer. To play with others, restart with{' '}
            <code>trayful play --share</code> (same network) or <code>trayful play --tunnel</code>{' '}
            (anywhere, through Cloudflare).
          </p>
        )}
        {links && links.length > 0 && (
          <>
            <p>
              Send one of these links. Anyone who has it can join <strong>{table}</strong>, and only
              that table, so share it only with your playtesters.
              {renewed && ' This is a new link; the old one no longer works.'}
            </p>
            <ul className="links">
              {links.map((link) => (
                <li key={link}>
                  <code>{link}</code>
                  <button type="button" onClick={() => copy(link)}>
                    {copied === link ? 'Copied' : 'Copy'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row">
          {links && links.length > 0 && (
            <button type="button" onClick={renew} title="Stop the current link working">
              New link
            </button>
          )}
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The player's private hand along the bottom of the screen. Drag cards from the
 * table onto it to take them; drag them out onto the table to play them (hold Alt
 * to play face down). No one else sees what is here.
 */
export function HandTray() {
  const table = useStore((s) => s.table);
  const view = useStore((s) => s.view);
  const me = useStore((s) => s.me?.player?.id);
  const over = useStore((s) => s.overHand);
  if (!table || !view || !me) return null;
  const hand = handOf(table, me);
  return (
    <section
      className={`hand-tray${over ? ' over' : ''}`}
      aria-label="Your hand"
      data-count={hand.length}
    >
      {hand.length === 0 ? (
        <p className="muted">
          Your hand: drag cards here to keep them hidden from the other players.
        </p>
      ) : (
        hand.map((piece) => <HandCard key={piece.id} piece={piece} />)
      )}
    </section>
  );
}

function HandCard({ piece }: Readonly<{ piece: Piece }>) {
  const view = useStore((s) => s.view)!;
  const type = view.types[piece.type];
  if (!type) return null;
  const [w, h] = sizeOf(type);
  const scale = CARD_HEIGHT / Math.max(h, w);
  const shown: Piece = { ...piece, pos: [0, 0], rot: 0, face: 'up' };
  const play = () => {
    // Double-click plays the card into the middle of the view.
    const { viewport: v, command } = useStore.getState();
    const x = (window.innerWidth / 2 - v.x) / v.scale;
    const y = (window.innerHeight / 2 - v.y) / v.scale;
    command({ type: 'move', ids: [piece.id], to: [Math.round(x), Math.round(y)] });
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
      <Stage width={w * scale + 4} height={h * scale + 4} listening={false}>
        <Layer>
          <Group x={2 + (w * scale) / 2} y={2 + (h * scale) / 2} scaleX={scale} scaleY={scale}>
            <Component piece={shown} type={type} palette={view.palette} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
