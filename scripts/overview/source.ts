/**
 * Reads one TypeScript file with the compiler's parser: its purpose comment, its
 * top-level declarations with their doc comments, the fields of its interfaces and
 * the cases of its tagged unions. No type checking, so it is fast and needs no project.
 */
import ts from 'typescript';
import type { Decl, DeclKind, Member, Variant } from './model.js';

const MAX_TYPE_LENGTH = 140;

/** Turns the inside of a `/** … *\/` comment into plain text, keeping paragraph breaks. */
export function cleanComment(raw: string): string {
  return raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The first sentence of a doc comment, on one line. */
export function firstSentence(doc: string): string {
  const flat = doc.split('\n\n')[0]!.replace(/\s+/g, ' ').trim();
  const end = /[.!?](\s|$)/.exec(flat);
  return end ? flat.slice(0, end.index + 1) : flat;
}

/** The last doc comment written between two positions, such as before a declaration. */
function docBetween(text: string, from: number, to: number): string | undefined {
  const comments = [...text.slice(from, to).matchAll(/\/\*\*[\s\S]*?\*\//g)];
  const last = comments.at(-1);
  if (!last) return undefined;
  // A comment followed by a blank line belongs to the file or a section, not to this node.
  const after = text.slice(from + last.index + last[0].length, to);
  if (/\n\s*\n/.test(after)) return undefined;
  return cleanComment(last[0]) || undefined;
}

function typeText(node: ts.Node | undefined, file: ts.SourceFile): string {
  if (!node) return '';
  const flat = node.getText(file).replace(/\s+/g, ' ');
  return flat.length > MAX_TYPE_LENGTH ? `${flat.slice(0, MAX_TYPE_LENGTH - 1)}…` : flat;
}

function membersOf(nodes: ts.NodeArray<ts.TypeElement>, file: ts.SourceFile, from: number) {
  const members: Member[] = [];
  let previousEnd = from;
  for (const node of nodes) {
    if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
      const type = ts.isPropertySignature(node) ? node.type : node;
      members.push({
        name: node.name.getText(file),
        type: typeText(type, file),
        optional: Boolean(node.questionToken),
        doc: docBetween(file.text, previousEnd, node.getStart(file)),
      });
    }
    previousEnd = node.getEnd();
  }
  return members;
}

function tagOf(literal: ts.TypeLiteralNode, file: ts.SourceFile): string | undefined {
  for (const member of literal.members) {
    if (
      ts.isPropertySignature(member) &&
      member.name.getText(file) === 'type' &&
      member.type &&
      ts.isLiteralTypeNode(member.type) &&
      ts.isStringLiteral(member.type.literal)
    ) {
      return member.type.literal.text;
    }
  }
  return undefined;
}

function variantsOf(union: ts.UnionTypeNode, file: ts.SourceFile, from: number) {
  const variants: Variant[] = [];
  let previousEnd = from;
  for (const type of union.types) {
    const tag = ts.isTypeLiteralNode(type) ? tagOf(type, file) : undefined;
    if (tag && ts.isTypeLiteralNode(type)) {
      variants.push({
        tag,
        doc: docBetween(file.text, previousEnd, type.getStart(file)),
        members: membersOf(type.members, file, type.members.pos).filter((m) => m.name !== 'type'),
        line: file.getLineAndCharacterOfPosition(type.getStart(file)).line + 1,
      });
    }
    previousEnd = type.getEnd();
  }
  return variants.length > 0 ? variants : undefined;
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

interface Named {
  name: string;
  kind: DeclKind;
  members?: Member[];
  variants?: Variant[];
}

function isPublic(node: ts.ClassElement): boolean {
  const hidden = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword];
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  return (
    node.name !== undefined &&
    !ts.isPrivateIdentifier(node.name) &&
    !modifiers.some((m) => hidden.includes(m.kind))
  );
}

/** The public properties, accessors and methods of a class, with their docs. */
function classMembers(node: ts.ClassDeclaration, file: ts.SourceFile): Member[] {
  const members: Member[] = [];
  let previousEnd = node.members.pos;
  for (const element of node.members) {
    const doc = docBetween(file.text, previousEnd, element.getStart(file));
    previousEnd = element.getEnd();
    if (!isPublic(element) || ts.isConstructorDeclaration(element)) continue;
    const name = element.name!.getText(file);
    if (ts.isMethodDeclaration(element)) {
      const params = element.parameters.map((p) => p.getText(file)).join(', ');
      members.push({
        name: `${name}()`,
        type: typeText(element.type, file) || `(${params})`,
        optional: false,
        doc,
      });
    } else if (ts.isPropertyDeclaration(element) || ts.isGetAccessorDeclaration(element)) {
      members.push({ name, type: typeText(element.type, file), optional: false, doc });
    }
  }
  return members;
}

function describe(node: ts.Statement, file: ts.SourceFile): Named[] {
  if (ts.isFunctionDeclaration(node) && node.name)
    return [{ name: node.name.text, kind: 'function' }];
  if (ts.isClassDeclaration(node) && node.name) {
    return [{ name: node.name.text, kind: 'class', members: classMembers(node, file) }];
  }
  if (ts.isEnumDeclaration(node)) return [{ name: node.name.text, kind: 'enum' }];
  if (ts.isInterfaceDeclaration(node)) {
    const members = membersOf(node.members, file, node.members.pos);
    return [{ name: node.name.text, kind: 'interface', members }];
  }
  if (ts.isTypeAliasDeclaration(node)) {
    const t = node.type;
    return [
      {
        name: node.name.text,
        kind: 'type',
        members: ts.isTypeLiteralNode(t) ? membersOf(t.members, file, t.members.pos) : undefined,
        variants: ts.isUnionTypeNode(t) ? variantsOf(t, file, t.pos) : undefined,
      },
    ];
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .filter((d) => ts.isIdentifier(d.name))
      .map((d) => ({ name: (d.name as ts.Identifier).text, kind: 'const' as const }));
  }
  return [];
}

export interface SourceSummary {
  purpose?: string;
  decls: Decl[];
}

/** Reads a file's purpose and declarations. */
export function readSource(fileName: string, text: string): SourceSummary {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const decls: Decl[] = [];
  let header: string | undefined;
  let previousEnd = 0;
  for (const statement of file.statements) {
    const start = statement.getStart(file);
    if (previousEnd === 0) header = fileHeader(text, start);
    const doc = docBetween(text, previousEnd, start);
    for (const named of describe(statement, file)) {
      decls.push({
        ...named,
        signature: signatureOf(statement, file),
        exported: isExported(statement),
        doc,
        summary: doc ? firstSentence(doc) : undefined,
        line: file.getLineAndCharacterOfPosition(start).line + 1,
      });
    }
    previousEnd = statement.getEnd();
  }
  return { purpose: header ?? mainDoc(decls), decls };
}

/** Without a file comment, the doc of what the file is mostly about: a class, else a function. */
function mainDoc(decls: Decl[]): string | undefined {
  const documented = decls.filter((d) => d.doc);
  const exported = documented.filter((d) => d.exported);
  return (
    exported.find((d) => d.kind === 'class') ??
    exported.find((d) => d.kind === 'function') ??
    exported[0] ??
    documented[0]
  )?.doc;
}

/** A declaration's first line without its body: `interface X extends Y`, or a short type. */
function signatureOf(node: ts.Statement, file: ts.SourceFile): string {
  const text = node
    .getText(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/^export\s+(default\s+)?/, '');
  const body = ts.isTypeAliasDeclaration(node) ? -1 : text.search(/[{=]/);
  const head = body > 0 ? text.slice(0, body) : text;
  const flat = head.replace(/\s+/g, ' ').replace(/;$/, '').trim();
  return flat.length > MAX_TYPE_LENGTH * 2 ? `${flat.slice(0, MAX_TYPE_LENGTH * 2 - 1)}…` : flat;
}

/**
 * A comment at the top of a file that stands apart from the first statement: before an
 * import, or followed by a blank line. Either a doc comment or a run of `//` lines.
 */
function fileHeader(text: string, firstStart: number): string | undefined {
  const before = text.slice(0, firstStart);
  const match =
    /^\s*(\/\*\*[\s\S]*?\*\/)(\s*)/.exec(before) ?? /^\s*((?:\/\/[^\n]*\n)+)(\s*)/.exec(before);
  if (!match) return undefined;
  const raw = match[1]!;
  // A `//` run ends with its newline, so one more newline is the blank line.
  const standsApart = raw.startsWith('//') ? match[2]!.includes('\n') : /\n\s*\n/.test(match[2]!);
  // An import or a re-export cannot have a doc comment of its own.
  const isImport = /^(import\b|export\s+(type\s+)?(\*|\{[^}]*\}\s+from))/.test(
    text.slice(firstStart),
  );
  if (!standsApart && !isImport) return undefined;
  return raw.startsWith('//') ? raw.replace(/^\/\/ ?/gm, '').trim() : cleanComment(raw);
}
