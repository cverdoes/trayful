// Field values to draw a type with: a design from the box, or stand-ins.
import { componentFields, type ComponentType, type Scalar } from '@trayful/formats/browser';
import type { BoxComponent } from './api';
import { fieldSpec, type FieldSpec } from './edit';

/**
 * Stand-in values for a type's fields, to draw it before the inventory has any:
 * those it declares, and those its labels and tiles imply.
 */
export function sampleData(type: ComponentType): Record<string, Scalar> {
  const implied = Object.entries(componentFields(type))
    .filter(([name]) => !(name in (type.fields ?? {})))
    .map(([name, field]): [string, Scalar] => {
      const spec = { type: field.type, values: field.enum ?? [], optional: field.optional };
      return [name, field.default ?? sampleValue(name, spec)];
    });
  const declared = Object.entries(type.fields ?? {}).map(([name, field]): [string, Scalar] => {
    const spec = fieldSpec(field);
    return [name, spec.default ?? sampleValue(name, spec)];
  });
  return Object.fromEntries<Scalar>([...implied, ...declared]);
}

const SAMPLE_VALUES: Partial<Record<FieldSpec['type'], Scalar>> = {
  int: 1,
  number: 1,
  bool: true,
  color: '#888888',
  image: '',
};

function sampleValue(name: string, spec: FieldSpec): Scalar {
  const value = spec.type === 'enum' ? spec.values[0] : SAMPLE_VALUES[spec.type];
  return value ?? name.charAt(0).toUpperCase() + name.slice(1);
}

/** One component per set of field values: copies of a card look the same. */
export function distinctDesigns(components: BoxComponent[]): BoxComponent[] {
  const seen = new Set<string>();
  return components.filter((c) => {
    const key = JSON.stringify(c.data);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A design's name: its `name` field, else its first text value, else its id. */
export function designName(component: BoxComponent): string {
  const { name } = component.data;
  if (typeof name === 'string' && name) return name;
  const text = Object.values(component.data).find((v) => typeof v === 'string' && v);
  return typeof text === 'string' ? text : component.id;
}
