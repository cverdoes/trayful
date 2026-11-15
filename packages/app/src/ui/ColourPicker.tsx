// A colour control: a button that shows the colour, and opens a small picker of the
// project's named colours, none, transparent, a field's colour or any other colour.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';

const HEX = /^#[0-9a-f]{6}$/i;
const FIELD = /^\{\{[^}]+\}\}$/;

/**
 * What a colour value shows as: its words, and a swatch that is a CSS colour or
 * one of `none`, `transparent` and `field`, drawn as their own patterns.
 */
export function colourLook(
  value: string | undefined,
  colours: Readonly<Record<string, string>>,
): { swatch: string; text: string } {
  if (value === undefined || value === '') return { swatch: 'none', text: 'none' };
  if (value === 'transparent') return { swatch: 'transparent', text: 'transparent' };
  if (FIELD.test(value)) return { swatch: 'field', text: value };
  return { swatch: colours[value] ?? value, text: value };
}

/** The `#rrggbb` the system picker starts at: the colour's own, or a named colour's. */
function hexOf(value: string | undefined, colours: Readonly<Record<string, string>>): string {
  const named = colours[value ?? ''];
  if (named && HEX.test(named)) return named;
  return value && HEX.test(value) ? value : '#ffffff';
}

/**
 * A button showing a colour; clicking it opens the picker under it (or above it,
 * near the bottom of the window). A pick, Escape, a press outside or scrolling closes it.
 */
export function ColourPicker({
  id,
  label,
  value,
  colours,
  fields = [],
  onChange,
}: Readonly<{
  id?: string;
  /** Names the button when no label element does. */
  label?: string;
  value: string | undefined;
  /** The project's named colours: name to `#rrggbb`. */
  colours: Readonly<Record<string, string>>;
  /** Fields whose value can give the colour, offered as `{{field}}`. */
  fields?: readonly string[];
  onChange: (value: string | undefined) => void;
}>) {
  // The button the picker hangs from, while it is open.
  const [anchor, setAnchor] = useState<HTMLButtonElement>();
  const look = colourLook(value, colours);
  const close = () => {
    anchor?.focus();
    setAnchor(undefined);
  };
  const pick = (to: string | undefined) => {
    onChange(to);
    close();
  };
  return (
    <span className="ui-colour">
      <button
        id={id}
        type="button"
        className="ui-colour-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== undefined}
        onClick={(e) => setAnchor(anchor ? undefined : e.currentTarget)}
      >
        <Swatch look={look.swatch} />
        <span className="ui-colour-text">{look.text}</span>
        <Icon name="down" />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(undefined)} onEscape={close}>
          <PickerBody
            value={value}
            colours={colours}
            fields={fields}
            onPick={pick}
            onCustom={onChange}
          />
        </Popover>
      )}
    </span>
  );
}

function Swatch({ look }: Readonly<{ look: string }>) {
  if (look === 'none') return <span className="ui-swatch none" aria-hidden />;
  if (look === 'transparent') return <span className="ui-swatch transparent" aria-hidden />;
  if (look === 'field')
    return (
      <span className="ui-swatch field" aria-hidden>
        {'{}'}
      </span>
    );
  return <span className="ui-swatch" style={{ background: look }} aria-hidden />;
}

/** The picker itself: named colours, then the other kinds of value, then any colour. */
function PickerBody({
  value,
  colours,
  fields,
  onPick,
  onCustom,
}: Readonly<{
  value: string | undefined;
  colours: Readonly<Record<string, string>>;
  fields: readonly string[];
  onPick: (value: string | undefined) => void;
  onCustom: (value: string | undefined) => void;
}>) {
  const named = Object.entries(colours);
  const choice = (to: string | undefined, text: string, look: string) => (
    <li key={text}>
      <button
        type="button"
        className={value === to ? 'chosen' : undefined}
        aria-pressed={value === to}
        onClick={() => onPick(to)}
      >
        <Swatch look={look} />
        {text}
      </button>
    </li>
  );
  return (
    <>
      {named.length > 0 && (
        <>
          <h3>Project colours</h3>
          <ul className="ui-colour-choices">
            {named.map(([name, colour]) => choice(name, name, colour))}
          </ul>
        </>
      )}
      <h3>Other</h3>
      <ul className="ui-colour-choices">
        {choice(undefined, 'none', 'none')}
        {choice('transparent', 'transparent', 'transparent')}
        {fields.map((field) => choice(`{{${field}}}`, `{{${field}}}`, 'field'))}
      </ul>
      <CustomColour value={value} colours={colours} onChange={onCustom} />
      {named.length === 0 && (
        <p className="ui-colour-hint">Name colours on the Assets page to list them here.</p>
      )}
    </>
  );
}

/** Any other colour: typed (`#c5523a`, a CSS name) or picked with the system's colour picker. */
function CustomColour({
  value,
  colours,
  onChange,
}: Readonly<{
  value: string | undefined;
  colours: Readonly<Record<string, string>>;
  onChange: (value: string | undefined) => void;
}>) {
  const [text, setText] = useState(value ?? '');
  const commit = () => {
    const typed = text.trim();
    if (typed !== (value ?? '')) onChange(typed === '' ? undefined : typed);
  };
  return (
    <div className="ui-colour-custom">
      <input
        type="text"
        aria-label="Colour value"
        placeholder="#rrggbb"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <input
        type="color"
        aria-label="Pick any colour"
        value={hexOf(value, colours)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

/** How far the picker keeps from the edges of the window, in pixels. */
const MARGIN = 8;

/**
 * A box fixed under its anchor, so no scrolling panel or grid cuts it off. It
 * flips above the anchor when there is no room below, and closes on a press
 * outside it or the anchor, or when anything scrolls.
 */
function Popover({
  anchor,
  onClose,
  onEscape,
  children,
}: Readonly<{
  anchor: HTMLElement;
  onClose: () => void;
  onEscape: () => void;
  children: ReactNode;
}>) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const at = anchor.getBoundingClientRect();
    const size = box.current?.getBoundingClientRect();
    if (!size) return;
    const below = at.bottom + size.height + MARGIN <= window.innerHeight;
    setPlace({
      top: below ? at.bottom + 4 : Math.max(MARGIN, at.top - size.height - 4),
      left: Math.max(
        MARGIN,
        Math.min(at.right - size.width, window.innerWidth - size.width - MARGIN),
      ),
    });
  }, [anchor]);
  // The latest close, so the listeners need not be added again on each render.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  });
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);
  useEffect(() => {
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) closing.current();
    };
    const scrolled = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) closing.current();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scrolled, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scrolled, true);
    };
  }, [anchor]);
  return (
    <div
      ref={box}
      className="ui-popover ui-colour-picker"
      role="dialog"
      aria-label="Pick a colour"
      style={place}
      onKeyDown={(e) => {
        // Keys pressed in the picker are its own, not shortcuts of the page around it.
        e.stopPropagation();
        if (e.key === 'Escape') onEscape();
      }}
      // Text pasted in it is its own too, not cells of a grid it sits in.
      onPaste={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
