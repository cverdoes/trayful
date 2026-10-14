import { describe, expect, it } from 'vitest';
import {
  coerceValue,
  isTemplate,
  normalizeField,
  renderTemplate,
  templateRefs,
  type NormalizedField,
} from './fields.js';

const field = (type: NormalizedField['type'], extra: Partial<NormalizedField> = {}) => ({
  type,
  optional: false,
  ...extra,
});

describe('normalizeField', () => {
  it('reads a shorthand type, with "?" for optional', () => {
    expect(normalizeField('int')).toEqual({ type: 'int', optional: false });
    expect(normalizeField('image?')).toEqual({ type: 'image', optional: true });
  });

  it('reads an object, defaulting to string, or enum when values are listed', () => {
    expect(normalizeField({ default: 'x' })).toMatchObject({ type: 'string', default: 'x' });
    expect(normalizeField({ enum: ['a', 'b'] })).toMatchObject({ type: 'enum', optional: false });
  });
});

describe('coerceValue', () => {
  it('accepts an allowed enum value, and matches CSV text to a number value', () => {
    const suit = field('enum', { enum: ['red', 2] });
    expect(coerceValue(suit, 'red', false)).toEqual({ value: 'red' });
    expect(coerceValue(suit, '2', true)).toEqual({ value: 2 });
    expect(coerceValue(suit, '2', false)).toEqual({ error: 'must be one of "red", 2' });
  });

  it('reads numbers from CSV text, but not from text in YAML', () => {
    expect(coerceValue(field('number'), '2.5', true)).toEqual({ value: 2.5 });
    expect(coerceValue(field('number'), '2.5', false)).toEqual({ error: 'must be a number' });
    expect(coerceValue(field('number'), ' ', true)).toEqual({ error: 'must be a number' });
  });

  it('wants whole numbers for int fields', () => {
    expect(coerceValue(field('int'), 3, false)).toEqual({ value: 3 });
    expect(coerceValue(field('int'), 3.5, false)).toEqual({ error: 'must be a whole number' });
  });

  it('reads yes/no words as booleans from CSV text', () => {
    expect(coerceValue(field('bool'), true, false)).toEqual({ value: true });
    expect(coerceValue(field('bool'), 'Yes', true)).toEqual({ value: true });
    expect(coerceValue(field('bool'), '0', true)).toEqual({ value: false });
    expect(coerceValue(field('bool'), 'yes', false)).toEqual({ error: 'must be true or false' });
  });

  it('turns numbers into text for text fields, but not booleans from YAML', () => {
    expect(coerceValue(field('string'), 'hi', false)).toEqual({ value: 'hi' });
    expect(coerceValue(field('color'), 7, false)).toEqual({ value: '7' });
    expect(coerceValue(field('image'), false, true)).toEqual({ value: 'false' });
    expect(coerceValue(field('string'), false, false)).toEqual({ error: 'must be text' });
  });
});

describe('templates', () => {
  it('finds the fields a template refers to', () => {
    expect(templateRefs('{{name}} costs {{ cost }}')).toEqual(['name', 'cost']);
    expect(isTemplate('{{name}}')).toBe(true);
    expect(isTemplate('plain')).toBe(false);
  });

  it('fills placeholders, leaving missing values empty', () => {
    expect(renderTemplate('{{name}}: {{cost}}', { name: 'Seed', cost: 2 })).toBe('Seed: 2');
    expect(renderTemplate('[{{missing}}]', {})).toBe('[]');
  });
});
