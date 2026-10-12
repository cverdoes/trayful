import type { Field, FieldType, Scalar } from './schemas.js';

export interface NormalizedField {
  type: FieldType | 'enum';
  enum?: (string | number)[];
  default?: Scalar;
  optional: boolean;
  description?: string;
}

export function normalizeField(field: Field): NormalizedField {
  if (typeof field === 'string') {
    const optional = field.endsWith('?');
    return { type: (optional ? field.slice(0, -1) : field) as FieldType, optional };
  }
  return {
    type: field.enum ? 'enum' : (field.type ?? 'string'),
    enum: field.enum,
    default: field.default,
    optional: field.optional ?? false,
    description: field.description,
  };
}

/**
 * Checks (and for CSV text, converts) one value against a field.
 * Returns the value to store, or an error message.
 */
export function coerceValue(
  field: NormalizedField,
  value: Scalar,
  fromText: boolean,
): { value: Scalar } | { error: string } {
  switch (field.type) {
    case 'enum': {
      const allowed = field.enum ?? [];
      const match = allowed.find((a) => a === value || (fromText && String(a) === String(value)));
      if (match === undefined)
        return { error: `must be one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}` };
      return { value: match };
    }
    case 'int':
    case 'number': {
      const n = typeof value === 'number' ? value : fromText ? Number(value) : NaN;
      if (typeof value === 'string' && value.trim() === '') return { error: 'must be a number' };
      if (!Number.isFinite(n)) return { error: 'must be a number' };
      if (field.type === 'int' && !Number.isInteger(n)) return { error: 'must be a whole number' };
      return { value: n };
    }
    case 'bool': {
      if (typeof value === 'boolean') return { value };
      if (fromText && /^(true|yes|1)$/i.test(String(value))) return { value: true };
      if (fromText && /^(false|no|0)$/i.test(String(value))) return { value: false };
      return { error: 'must be true or false' };
    }
    case 'string':
    case 'image':
    case 'color':
      if (typeof value === 'string') return { value };
      if (fromText || typeof value === 'number') return { value: String(value) };
      return { error: 'must be text' };
  }
}

/** Field names referenced as `{{name}}` in a template string. */
export function templateRefs(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]!);
}

export function isTemplate(text: string): boolean {
  return text.includes('{{');
}

/** Fills `{{field}}` placeholders from data. Missing values become empty text. */
export function renderTemplate(text: string, data: Record<string, Scalar | undefined>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name: string) =>
    data[name] === undefined ? '' : String(data[name]),
  );
}
