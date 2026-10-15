import type { ComponentType } from '@trayful/formats/browser';
import { Document, isScalar, visit } from 'yaml';

/**
 * A type as a library file would hold it, for the read-only YAML pane. Short
 * lists of plain values are written on one line, as `[63, 88]`.
 */
export function typeYaml(type: ComponentType): string {
  const doc = new Document([type]);
  visit(doc, {
    Seq: (_key, node) => {
      if (node !== doc.contents && node.items.every(isScalar)) node.flow = true;
    },
  });
  return doc.toString({ flowCollectionPadding: false, lineWidth: 0, singleQuote: true });
}
