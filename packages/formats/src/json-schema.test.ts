import { describe, expect, it } from 'vitest';
import { toJsonSchemas } from './json-schema.js';

describe('toJsonSchemas', () => {
  it('makes one JSON Schema per file kind, with an id that points at its published file', () => {
    const schemas = toJsonSchemas();
    expect(Object.keys(schemas)).toEqual(['manifest', 'library', 'inventory', 'setup', 'table']);
    expect(schemas.library).toMatchObject({
      $ref: '#/$defs/Library',
      $id: expect.stringMatching(/\/schema\/library\.schema\.json$/),
    });
  });
});
