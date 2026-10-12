import { renderTemplate, type Scalar } from '@trayful/formats/browser';

export type Data = Record<string, Scalar | undefined>;

/** Resolves a colour value: fills `{{field}}` templates, then looks names up in the palette. */
export function resolveColor(
  value: string | undefined,
  data: Data,
  palette: Record<string, string>,
): string | undefined {
  if (!value) return undefined;
  const text = renderTemplate(value, data).trim();
  if (!text) return undefined;
  return palette[text] ?? text;
}

/** A `when` condition: shown unless it renders empty, `false` or `0`. */
export function isShown(when: string | undefined, data: Data): boolean {
  if (when === undefined) return true;
  const text = renderTemplate(when, data).trim();
  return text !== '' && text !== 'false' && text !== '0';
}
