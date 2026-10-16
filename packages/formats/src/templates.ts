// Where a component's faces use its fields.
import { backOf } from './component.js';
import { templateRefs } from './fields.js';
import type { Back, ComponentType, Face, Label, Layer } from './schemas.js';

/** A text that may hold `{{field}}` placeholders, and where it is in the component. */
export interface TemplateAt {
  text: string;
  path: (string | number)[];
}

/** The texts in a face that may hold `{{field}}` placeholders, with their paths. */
export function faceTemplates(face: Face | Back, path: (string | number)[]): TemplateAt[] {
  const templates = present([
    { text: face.fill, path: [...path, 'fill'] },
    { text: face.stroke, path: [...path, 'stroke'] },
  ]);
  for (const [i, layer] of (face.layers ?? []).entries()) {
    for (const t of layerTemplates(layer)) {
      templates.push({ text: t.text, path: [...path, 'layers', i, ...t.path] });
    }
  }
  for (const [i, label] of (face.labels ?? []).entries()) {
    for (const t of labelTemplates(label)) {
      templates.push({ text: t.text, path: [...path, 'labels', i, ...t.path] });
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

function labelTemplates(label: Label): TemplateAt[] {
  return present([
    { text: label.text, path: ['text'] },
    { text: label.color, path: ['color'] },
    { text: label.when, path: ['when'] },
  ]);
}

/** Leaves out the texts a component or layer does not set. */
function present(
  templates: { text: string | undefined; path: (string | number)[] }[],
): TemplateAt[] {
  return templates.filter((t): t is TemplateAt => t.text !== undefined);
}

/**
 * The fields a component's back shows. They are printed on the back, so everyone
 * may see them while the component lies face down: a coin's suit, a card's deck.
 */
export function backFields(type: ComponentType): string[] {
  const back = backOf(type);
  if (!back) return [];
  const refs = faceTemplates(back, []).flatMap(({ text }) => templateRefs(text));
  for (const label of back.labels ?? []) if (label.field) refs.push(label.field);
  if (typeof back.image === 'object' && back.image.tile === 'instance') refs.push('tile');
  return [...new Set(refs)];
}
