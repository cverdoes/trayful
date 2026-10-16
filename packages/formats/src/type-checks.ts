import { backOf, componentFields, isValued } from './component.js';
import { coerceValue, templateRefs, type NormalizedField } from './fields.js';
import { faceTemplates } from './templates.js';
import type { Problem } from './diagnostics.js';
import {
  AREA_MODES,
  SPOT_MODES,
  type Back,
  type ComponentType,
  type Face,
  type ImageRef,
  type SnapTarget,
} from './schemas.js';

/**
 * Checks a component for problems its schema cannot see on its own. Problems that
 * need the rest of the project (an unknown asset, an `accepts` naming nothing) are
 * found by the loader.
 */
export function typeProblems(type: ComponentType): Problem[] {
  const fields = componentFields(type);
  return [
    ...representationProblems(type),
    ...valueProblems(type),
    ...defaultProblems(fields),
    ...snapProblems(type),
    ...faceProblems(type),
    ...templateProblems(type, fields),
  ];
}

const BEHAVIOURS = ['flippable', 'rotates', 'stackable', 'container'] as const;

/** Behaviours belong to pieces and zones, values to dice and counters. */
function representationProblems(type: ComponentType): Problem[] {
  const problems: Problem[] = [];
  if (isValued(type)) {
    for (const key of BEHAVIOURS) {
      if (type[key] !== undefined)
        problems.push({ path: [key], message: `A ${type.is} cannot have "${key}".` });
    }
  } else if (type.values) {
    problems.push({ path: ['values'], message: 'Only dice and counters have values.' });
  }
  return problems;
}

function valueProblems(type: ComponentType): Problem[] {
  const values = type.values;
  if (!values) return [];
  if (values.range && values.list)
    return [{ path: ['values'], message: 'Give either "range" or "list", not both.' }];
  if (values.range && values.range[0] > values.range[1])
    return [{ path: ['values', 'range'], message: 'The minimum is larger than the maximum.' }];
  return [];
}

/** Every default must be a valid value of its field. */
function defaultProblems(fields: Record<string, NormalizedField>): Problem[] {
  const problems: Problem[] = [];
  for (const [name, field] of Object.entries(fields)) {
    if (field.default === undefined) continue;
    const result = coerceValue(field, field.default, false);
    if ('error' in result) {
      problems.push({
        path: ['fields', name, 'default'],
        message: `Default value ${result.error}.`,
      });
    }
  }
  return problems;
}

/** Each drop area has exactly one kind of spot, and a unique id. */
function snapProblems(type: ComponentType): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const [i, target] of (type.container ?? []).entries()) {
    const kinds = [target.grid, target.points, target.area].filter(Boolean).length;
    if (kinds !== 1) {
      problems.push({
        path: ['container', i],
        message: 'Give exactly one of "grid", "points" or "area".',
      });
    }
    const mode = modeProblem(target);
    if (mode) problems.push({ path: ['container', i, 'mode'], message: mode });
    if (ids.has(target.id)) {
      problems.push({
        path: ['container', i, 'id'],
        message: `Drop area "${target.id}" is defined twice.`,
      });
    }
    ids.add(target.id);
  }
  return problems;
}

/** A mode that does not suit the kind of drop area it is on. */
function modeProblem(target: SnapTarget): string | undefined {
  if (!target.mode) return undefined;
  if (target.area) {
    return (AREA_MODES as readonly string[]).includes(target.mode)
      ? undefined
      : `An area's mode is one of ${AREA_MODES.join(', ')}.`;
  }
  return (SPOT_MODES as readonly string[]).includes(target.mode)
    ? undefined
    : `Spots' mode is one of ${SPOT_MODES.join(', ')}.`;
}

/** The faces a component has, each with its path inside the component. */
function sides(type: ComponentType): { side: Face | Back; path: (string | number)[] }[] {
  const back = backOf(type);
  return [
    ...(type.face ? [{ side: type.face, path: ['face'] }] : []),
    ...(back ? [{ side: back, path: ['flippable', 'back'] }] : []),
  ];
}

/** Labels need one of `text` and `field`; image tiles need a way to pick them. */
function faceProblems(type: ComponentType): Problem[] {
  const problems: Problem[] = [];
  for (const { side, path } of sides(type)) {
    for (const [i, label] of (side.labels ?? []).entries()) {
      if ((label.text === undefined) === (label.field === undefined))
        problems.push({ path: [...path, 'labels', i], message: 'Give one of "text" or "field".' });
    }
    if (side.image) problems.push(...imageProblems(type, side.image, [...path, 'image']));
  }
  return problems;
}

function imageProblems(type: ComponentType, ref: ImageRef, path: (string | number)[]): Problem[] {
  if (typeof ref === 'string') return [];
  const problems: Problem[] = [];
  if ((ref.row === undefined) !== (ref.col === undefined))
    problems.push({ path, message: 'Give both "row" and "col".' });
  if (ref.row !== undefined && ref.tile !== undefined)
    problems.push({ path, message: 'Give either "tile" or "row" and "col", not both.' });
  if (ref.tile === 'value' && !isValued(type))
    problems.push({
      path: [...path, 'tile'],
      message: 'Only dice and counters show their value as a tile.',
    });
  return problems;
}

/** Every `{{field}}` used in a face must be a field of the component. */
function templateProblems(type: ComponentType, fields: Record<string, NormalizedField>): Problem[] {
  const templates = sides(type).flatMap(({ side, path }) => faceTemplates(side, path));
  return templates.flatMap(({ text, path }) =>
    templateRefs(text)
      .filter((ref) => !fields[ref])
      .map((ref) => ({ path, message: `"{{${ref}}}" is not a field of "${type.id}".` })),
  );
}
