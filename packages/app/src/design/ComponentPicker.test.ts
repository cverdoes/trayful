import { describe, expect, it } from 'vitest';
import { acceptOptions, componentOptions, findOption } from './ComponentPicker';

const options = [
  { value: 'card', label: 'Card' },
  { value: 'card-back', label: 'Card back' },
  { value: 'token', label: 'Gold coin' },
];

describe('findOption', () => {
  it('finds an option by its id or its name, ignoring case', () => {
    expect(findOption(options, 'CARD')?.value).toBe('card');
    expect(findOption(options, 'gold coin')?.value).toBe('token');
  });

  it('takes the start of a name only when one option starts so', () => {
    expect(findOption(options, 'gol')?.value).toBe('token');
    expect(findOption(options, 'car')).toBeUndefined();
    expect(findOption(options, ' ')).toBeUndefined();
  });
});

describe('options', () => {
  const types = {
    meeple: { id: 'meeple', size: 16, is: 'piece' as const, name: 'Worker' },
    cube: { id: 'cube', size: 10, is: 'piece' as const, stackable: true as const },
  };

  it('lists components by name, leaving out the ones turned down', () => {
    expect(componentOptions(types)).toEqual([
      { value: 'cube', label: 'cube' },
      { value: 'meeple', label: 'Worker' },
    ]);
    expect(componentOptions(types, (t) => t.stackable !== undefined)).toEqual([
      { value: 'cube', label: 'cube' },
    ]);
  });

  it('offers any component of a kind before particular ones', () => {
    expect(acceptOptions(types).map((o) => o.label)).toEqual([
      'Any piece',
      'Any zone',
      'Any die',
      'Any counter',
      'cube',
      'Worker',
    ]);
  });
});
