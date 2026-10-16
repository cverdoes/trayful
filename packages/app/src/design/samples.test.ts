import type { ComponentType } from '@trayful/formats/browser';
import { expect, it } from 'vitest';
import type { BoxComponent } from './api';
import { designName, distinctDesigns, sampleData } from './samples';
import { typeYaml } from './yaml';

const type = {
  id: 'card',
  is: 'piece',
  size: [63, 88],
  fields: {
    title: 'string',
    cost: 'int',
    season: { enum: ['spring', 'summer'] },
    rare: 'bool?',
    tint: { type: 'color', default: '#ff0000' },
  },
} as ComponentType;

it('makes up a value for each field, or takes its default', () => {
  expect(sampleData(type)).toEqual({
    title: 'Title',
    cost: 1,
    season: 'spring',
    rare: true,
    tint: '#ff0000',
  });
  expect(sampleData({ id: 'x', is: 'piece', size: 16, face: { shape: 'meeple' } })).toEqual({});
});

it('lists each design in the box once, by a readable name', () => {
  const box: BoxComponent[] = [
    { id: 'c1', type: 'card', data: { name: 'Plough', cost: 2 } },
    { id: 'c2', type: 'card', data: { name: 'Plough', cost: 2 } },
    { id: 'c3', type: 'card', data: { cost: 3, title: 'Sow' } },
    { id: 'c4', type: 'card', data: { cost: 4 } },
  ];
  const designs = distinctDesigns(box);
  expect(designs.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  expect(designs.map(designName)).toEqual(['Plough', 'Sow', 'c4']);
});

it('shows a type as a library file holds it', () => {
  const yaml = typeYaml({ ...type, face: { fill: '#ffffff' } });
  expect(yaml).toContain('- id: card\n');
  expect(yaml).toContain('size: [63, 88]');
  expect(yaml).toContain("fill: '#ffffff'");
  expect(yaml).toContain('enum: [spring, summer]');
});
