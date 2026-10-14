import { coerceValue, templateRefs, type NormalizedField } from './fields.js';
import type { Problem } from './diagnostics.js';
import { PRIMITIVE_INFO, type ComponentType, type Face, type Layer } from './schemas.js';

/** Checks a component type for problems its schema cannot see on its own. */
export function typeProblems(
  type: ComponentType,
  fields: Record<string, NormalizedField>,
): Problem[] {
  return [
    ...primitiveProblems(type),
    ...defaultProblems(fields),
    ...snapProblems(type),
    ...templateProblems(type, fields),
  ];
}

/** Keys that do not suit the primitive, or that contradict each other. */
function primitiveProblems(type: ComponentType): Problem[] {
  const info = PRIMITIVE_INFO[type.base];
  const problems: Problem[] = [];
  const report = (key: string, message: string) => problems.push({ path: [key], message });
  if (type.back && info.sides === 1)
    report('back', `A ${type.base} has one side, so it cannot have a "back".`);
  if (type.snap && !info.snapTargets)
    report('snap', 'Only boards, tiles and zones can have snap targets.');
  if (type.range && type.base !== 'counter') report('range', '"range" is only for counters.');
  if (type.faces && type.base !== 'die') report('faces', '"faces" is only for dice.');
  if (type.range && type.range[0] > type.range[1])
    report('range', 'The minimum is larger than the maximum.');
  if (type.fill && type.front?.fill) report('fill', 'Use either "fill" or "front.fill", not both.');
  return problems;
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

/** Each snap target has exactly one kind of spot, and a unique id. */
function snapProblems(type: ComponentType): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const [i, target] of (type.snap ?? []).entries()) {
    const kinds = [target.grid, target.points, target.area].filter(Boolean).length;
    if (kinds !== 1) {
      problems.push({
        path: ['snap', i],
        message: 'Give exactly one of "grid", "points" or "area".',
      });
    }
    if (ids.has(target.id)) {
      problems.push({
        path: ['snap', i, 'id'],
        message: `Snap target "${target.id}" is defined twice.`,
      });
    }
    ids.add(target.id);
  }
  return problems;
}

/** A text that may hold `{{field}}` placeholders, and where it is in the type. */
interface TemplateAt {
  text: string;
  path: (string | number)[];
}

/** Every `{{field}}` used in a face must be a declared field. */
function templateProblems(type: ComponentType, fields: Record<string, NormalizedField>): Problem[] {
  const templates = present([{ text: type.fill, path: ['fill'] }]);
  for (const side of ['front', 'back'] as const) {
    const face = type[side];
    if (face) templates.push(...faceTemplates(face, side));
  }
  return templates.flatMap(({ text, path }) =>
    templateRefs(text)
      .filter((ref) => !fields[ref])
      .map((ref) => ({ path, message: `"{{${ref}}}" is not a field of "${type.id}".` })),
  );
}

/** The texts in a face that may hold `{{field}}` placeholders, with their paths. */
function faceTemplates(face: Face, side: string): TemplateAt[] {
  const templates = present([
    { text: face.fill, path: [side, 'fill'] },
    { text: face.stroke, path: [side, 'stroke'] },
  ]);
  for (const [i, layer] of (face.layers ?? []).entries()) {
    for (const { text, path } of layerTemplates(layer)) {
      templates.push({ text, path: [side, 'layers', i, ...path] });
    }
  }
  return templates;
}

/** The layer's texts; each kind of layer has only some of these keys. */
function layerTemplates(layer: Layer): TemplateAt[] {
  return present([
    { text: 'text' in layer ? layer.text : undefined, path: ['text'] },
    { text: 'image' in layer ? layer.image : undefined, path: ['image'] },
    { text: 'color' in layer ? layer.color : undefined, path: ['color'] },
    { text: 'fill' in layer ? layer.fill : undefined, path: ['fill'] },
    { text: 'stroke' in layer ? layer.stroke : undefined, path: ['stroke'] },
    { text: layer.when, path: ['when'] },
  ]);
}

/** Leaves out the texts a type or layer does not set. */
function present(
  templates: { text: string | undefined; path: (string | number)[] }[],
): TemplateAt[] {
  return templates.filter((t): t is TemplateAt => t.text !== undefined);
}
