import { sameValue } from '@trayful/formats';
import {
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Document,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';

/**
 * Changes a node of a parsed YAML document to hold `value`, touching only what
 * differs. Keys and items that keep their value keep their node, and with it their
 * comments and style, so an edit made in the designer leaves the rest of a
 * hand-written file as its author wrote it.
 *
 * Returns the node that now holds the value: `node` itself, or a new node when
 * the kind of value changed (a list became a map, say) and the caller must put it
 * in place.
 */
export function patchNode(doc: Document, node: unknown, value: unknown): unknown {
  if (isMap(node) && isRecord(value)) {
    patchMap(doc, node, value);
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    patchSeq(doc, node, value);
    return node;
  }
  if (isScalar(node) && !isRecord(value) && !Array.isArray(value)) {
    if (node.value !== value) node.value = value;
    return node;
  }
  return createNode(doc, value);
}

/**
 * A new node for a value, written the way people write these files: short lists
 * of plain values on one line (`[63, 88]`), and an item added next to items
 * written on one line (`{ text: Hi, at: [5, 5] }`) on one line too.
 */
export function createNode(doc: Document, value: unknown, sibling?: unknown): unknown {
  const node = doc.createNode(value);
  visit(node, {
    Seq: (_key, seq) => {
      if (seq.items.every(isScalar)) seq.flow = true;
    },
  });
  if ((isMap(node) || isSeq(node)) && (isMap(sibling) || isSeq(sibling)) && sibling.flow) {
    node.flow = true;
  }
  return node;
}

function patchMap(doc: Document, map: YAMLMap, value: Record<string, unknown>): void {
  for (const pair of [...map.items]) {
    const key = keyOf(pair);
    if (typeof key === 'string' && value[key] === undefined) map.delete(key);
  }
  const order = Object.keys(value);
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    const current = map.get(key, true);
    if (current === undefined) insertPair(map, doc.createPair(key, createNode(doc, item)), order);
    else {
      const next = patchNode(doc, current, item);
      if (next !== current) map.set(key, next);
    }
  }
}

/** Puts a new key where the value has it: before the first later key the map already holds. */
function insertPair(map: YAMLMap, pair: YAMLMap['items'][number], order: string[]): void {
  const later = new Set(order.slice(order.indexOf(String(keyOf(pair))) + 1));
  const at = map.items.findIndex((p) => later.has(String(keyOf(p))));
  if (at === -1) map.items.push(pair);
  else map.items.splice(at, 0, pair);
}

function keyOf(pair: { key: unknown }): unknown {
  return isScalar(pair.key) ? pair.key.value : pair.key;
}

/**
 * An item that is unchanged keeps its node wherever it moved to, so removing or
 * reordering layers keeps each comment with its own layer. A changed item is
 * patched in the node at its position, unless that node went to an unchanged item.
 */
function patchSeq(doc: Document, seq: YAMLSeq, value: unknown[]): void {
  const old = [...seq.items];
  const free = new Set(old.keys());
  const kept = value.map((item) => {
    const at = old.findIndex(
      (node, i) => free.has(i) && sameValue(isNode(node) ? node.toJS(doc) : node, item),
    );
    free.delete(at);
    return at;
  });
  seq.items = value.map((item, i) => {
    if (kept[i] !== -1) return old[kept[i]!];
    if (free.has(i)) return patchNode(doc, old[i], item);
    return createNode(doc, item, old.at(-1));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Flow collections written over several lines in the file they were read from. */
const multiline = new WeakSet<YAMLMap | YAMLSeq>();

/** Parses a YAML file, noting what `yamlText` needs to write it back as it was. */
export function parseYaml(text: string): Document {
  const doc = parseDocument(text);
  const note = (_key: unknown, node: YAMLMap | YAMLSeq) => {
    const [start, end] = node.range ?? [0, 0];
    if (node.flow && text.slice(start, end).includes('\n')) multiline.add(node);
  };
  visit(doc, { Map: note, Seq: note });
  return doc;
}

/**
 * Writes a document out the way Prettier formats YAML, which is how people and the
 * example projects write Trayful files: flow lists without inner spaces (`[63, 88]`),
 * flow maps with them (`{ size: 9 }`), long lines left as they are, and a flow
 * collection that was broken over lines kept that way. A file read with `parseYaml`
 * and written back unchanged comes out byte for byte the same.
 */
export function yamlText(doc: Document): string {
  const style = (padding: string) => (_key: unknown, node: YAMLMap | YAMLSeq) => {
    if (node.flow) setFlowStyle(node, padding, multiline.has(node));
  };
  visit(doc, { Map: style(' '), Seq: style('') });
  return doc.toString({ lineWidth: 0, singleQuote: true });
}

/**
 * The yaml library writes every flow collection alike; this sets the padding and
 * line breaking for one collection by adjusting the options it is written with.
 * It breaks a collection over lines only when it is wider than `lineWidth`, so a
 * width of 1 breaks it; its keys and values are then written with no width limit,
 * so they stay on the line of their key.
 */
function setFlowStyle(node: YAMLMap | YAMLSeq, padding: string, broken: boolean): void {
  withOptions(
    node,
    { flowCollectionPadding: padding },
    { lineWidth: broken ? 1 : 0, trailingComma: broken },
  );
  if (broken && isMap(node)) {
    for (const pair of node.items) withOptions(pair, {}, { lineWidth: 0, trailingComma: false });
  }
}

type Writable = Pick<YAMLMap, 'toString'>;
type WriteContext = NonNullable<Parameters<YAMLMap['toString']>[0]>;

/**
 * The yaml library takes write options for a whole document only, so this wraps one
 * node's own `toString` to adjust them for that node and what is inside it.
 */
function withOptions(
  node: Writable,
  context: Partial<WriteContext>,
  options: Partial<WriteContext['options']>,
): void {
  const write = node.toString.bind(node);
  node.toString = (ctx, ...rest) =>
    write(ctx && { ...ctx, ...context, options: { ...ctx.options, ...options } }, ...rest);
}
