import * as ts from 'typescript';
import { buildProgram, parseOnly, tokens } from './program';
import { PALETTE_SIZE } from '../styles';

// Highlight lenses after Hillel Wayne's "Syntax highlighting is a waste of an information
// channel": color carries one question about the code (nesting, provenance, data flow,
// types, failure, history) instead of restating the grammar.

export interface Span { start: number; end: number; style: string }
export interface LineMark { line: number; style: string }
export interface LegendEntry { style: string; label: string }
export interface Analysis { spans: Span[]; lines: LineMark[]; legend: LegendEntry[] }

export interface AnalyzeInput {
  fileName: string;
  text: string;
  /** 0-based document lines that differ from the base branch (git lens only). */
  changedLines?: Set<number>;
}

type Analyzer = (input: AnalyzeInput) => Analysis;

const empty = (): Analysis => ({ spans: [], lines: [], legend: [] });

// ---------------------------------------------------------------------------------------
// Rainbow brackets: color = nesting depth of (), [], {}.

const OPEN = new Set([ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.OpenBracketToken, ts.SyntaxKind.OpenBraceToken]);
const CLOSE = new Set([ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken]);

const rainbow: Analyzer = ({ fileName, text }) => {
  const sf = parseOnly(fileName, text);
  const out = empty();
  let depth = 0;
  for (const t of tokens(sf)) {
    if (OPEN.has(t.kind)) {
      out.spans.push({ start: t.getStart(sf), end: t.end, style: `depth${depth % 6}` });
      depth++;
    } else if (CLOSE.has(t.kind)) {
      depth = Math.max(0, depth - 1);
      out.spans.push({ start: t.getStart(sf), end: t.end, style: `depth${depth % 6}` });
    }
  }
  out.legend = [0, 1, 2, 3, 4, 5].map(d => ({ style: `depth${d}`, label: `depth ${d + 1}` }));
  return out;
};

// ---------------------------------------------------------------------------------------
// Context: shade each line by how many scopes (blocks, bodies) enclose it.

function braceSpan(n: ts.Node, sf: ts.SourceFile): [number, number] | undefined {
  if (ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseBlock(n)) return [n.getStart(sf), n.end];
  if (ts.isClassLike(n) || ts.isInterfaceDeclaration(n) || ts.isEnumDeclaration(n)) {
    const open = n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.OpenBraceToken);
    if (open) return [open.getStart(sf), n.end];
  }
  return undefined;
}

const context: Analyzer = ({ fileName, text }) => {
  const sf = parseOnly(fileName, text);
  const lineCount = sf.getLineStarts().length;
  const depth = new Array<number>(lineCount).fill(0);
  const visit = (n: ts.Node) => {
    const span = braceSpan(n, sf);
    if (span) {
      const a = sf.getLineAndCharacterOfPosition(span[0]).line;
      const b = sf.getLineAndCharacterOfPosition(span[1]).line;
      for (let l = a + 1; l < b; l++) depth[l]++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const out = empty();
  depth.forEach((d, line) => { if (d > 0) out.lines.push({ line, style: `ctx${Math.min(d, 6)}` }); });
  out.legend = [1, 2, 3, 4, 5, 6].map(d => ({ style: `ctx${d}`, label: `${d} level${d > 1 ? 's' : ''} deep` }));
  return out;
};

// ---------------------------------------------------------------------------------------
// Helpers for checker-based lenses.

function symbolAt(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
    return checker.getShorthandAssignmentValueSymbol(id.parent);
  }
  return checker.getSymbolAtLocation(id);
}

function identifiers(sf: ts.SourceFile, fn: (id: ts.Identifier) => void) {
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n)) fn(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const span = (sf: ts.SourceFile, n: ts.Node, style: string): Span => ({ start: n.getStart(sf), end: n.end, style });

// ---------------------------------------------------------------------------------------
// Imports: every identifier bound by an import is colored by the module it came from.

function importModule(sym: ts.Symbol): string | undefined {
  for (const d of sym.declarations ?? []) {
    if (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d) || ts.isImportEqualsDeclaration(d)) {
      let n: ts.Node = d;
      while (n && !ts.isImportDeclaration(n) && !ts.isImportEqualsDeclaration(n)) n = n.parent;
      if (n && ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) return n.moduleSpecifier.text;
      if (n && ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteral(n.moduleReference.expression)) {
        return n.moduleReference.expression.text;
      }
    }
    // const x = require('mod') / const { a } = require('mod')
    let v: ts.Node | undefined = d;
    while (v && ts.isBindingElement(v)) v = v.parent?.parent;
    if (v && ts.isVariableDeclaration(v) && v.initializer && ts.isCallExpression(v.initializer)) {
      const c = v.initializer;
      if (ts.isIdentifier(c.expression) && c.expression.text === 'require' && c.arguments[0] && ts.isStringLiteral(c.arguments[0])) {
        return c.arguments[0].text;
      }
    }
  }
  return undefined;
}

const imports: Analyzer = ({ fileName, text }) => {
  const { sf, checker } = buildProgram(fileName, text);
  const out = empty();
  const modules = new Map<string, string>();
  const styleFor = (mod: string) => {
    if (!modules.has(mod)) modules.set(mod, `mod${modules.size % PALETTE_SIZE}`);
    return modules.get(mod)!;
  };
  // Module specifiers first, so colors follow import order.
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      out.spans.push(span(sf, st.moduleSpecifier, styleFor(st.moduleSpecifier.text)));
    }
  }
  identifiers(sf, id => {
    const sym = symbolAt(checker, id);
    if (!sym) return;
    const mod = importModule(sym);
    if (mod) out.spans.push(span(sf, id, styleFor(mod)));
    else if (ts.isCallExpression(id.parent) && id.text === 'require' && ts.isStringLiteral(id.parent.arguments[0] ?? id)) {
      const lit = id.parent.arguments[0] as ts.StringLiteral;
      out.spans.push(span(sf, lit, styleFor(lit.text)));
    }
  });
  out.legend = [...modules].map(([mod, style]) => ({ style, label: mod }));
  return out;
};

// ---------------------------------------------------------------------------------------
// Arguments: parameters vs. values derived from them vs. other locals vs. module scope.

function isFunctionLike(n: ts.Node): n is ts.SignatureDeclaration {
  return ts.isFunctionLike(n);
}

function rootDeclaration(d: ts.Node): ts.Node {
  while (ts.isBindingElement(d) || ts.isObjectBindingPattern(d) || ts.isArrayBindingPattern(d)) d = d.parent;
  return d;
}

const argumentsLens: Analyzer = ({ fileName, text }) => {
  const { sf, checker } = buildProgram(fileName, text);
  const out = empty();
  const kind = new Map<ts.Symbol, string>();

  const classify = (sym: ts.Symbol): string | undefined => {
    if (kind.has(sym)) return kind.get(sym);
    const decl = sym.valueDeclaration ?? sym.declarations?.[0];
    if (!decl || decl.getSourceFile() !== sf) return undefined;
    const root = rootDeclaration(decl);
    let result: string | undefined;
    if (ts.isParameter(root)) result = 'param';
    else if (ts.isVariableDeclaration(root)) {
      let p: ts.Node = root;
      while (p && !isFunctionLike(p) && !ts.isSourceFile(p)) p = p.parent;
      if (ts.isSourceFile(p)) result = 'global';
      else {
        kind.set(sym, 'local'); // guard against self-reference while scanning the initializer
        result = root.initializer && refersToParam(root.initializer) ? 'paramDerived' : 'local';
      }
    } else if (ts.isFunctionDeclaration(root) || ts.isClassDeclaration(root)) {
      result = root.parent && ts.isSourceFile(root.parent) ? 'global' : 'local';
    }
    if (result) kind.set(sym, result);
    return result;
  };
  const refersToParam = (n: ts.Node): boolean => {
    let found = false;
    const visit = (c: ts.Node) => {
      if (found) return;
      if (ts.isIdentifier(c)) {
        const s = symbolAt(checker, c);
        const k = s && classify(s);
        if (k === 'param' || k === 'paramDerived') { found = true; return; }
      }
      if (isFunctionLike(c)) return;
      ts.forEachChild(c, visit);
    };
    visit(n);
    return found;
  };

  identifiers(sf, id => {
    if (ts.isPropertyAccessExpression(id.parent) && id.parent.name === id) return;
    if (ts.isPropertyAssignment(id.parent) && id.parent.name === id) return;
    const sym = symbolAt(checker, id);
    const k = sym && classify(sym);
    if (k) out.spans.push(span(sf, id, k));
  });
  out.legend = [
    { style: 'param', label: 'function argument' },
    { style: 'paramDerived', label: 'computed from an argument' },
    { style: 'local', label: 'other local' },
    { style: 'global', label: 'module-level' },
  ];
  return out;
};

// ---------------------------------------------------------------------------------------
// Types: color identifiers by what kind of value they hold.

function typeCategory(checker: ts.TypeChecker, t: ts.Type): { cat?: string; nullable: boolean } {
  const F = ts.TypeFlags;
  if (t.flags & (F.Any | F.Unknown)) return { cat: 'any', nullable: false };
  if (t.isUnion()) {
    let nullable = false;
    const cats = new Set<string>();
    for (const u of t.types) {
      if (u.flags & (F.Null | F.Undefined | F.Void)) { nullable = true; continue; }
      const c = typeCategory(checker, u).cat;
      if (c) cats.add(c);
    }
    if (cats.size === 1) return { cat: [...cats][0], nullable };
    return { cat: cats.size ? 'mixed' : undefined, nullable };
  }
  if (t.flags & (F.NumberLike | F.BigIntLike)) return { cat: 'number', nullable: false };
  if (t.flags & F.StringLike) return { cat: 'string', nullable: false };
  if (t.flags & F.BooleanLike) return { cat: 'boolean', nullable: false };
  if (t.flags & (F.Null | F.Undefined | F.Void)) return { nullable: true };
  const anyChecker = checker as ts.TypeChecker & { isArrayType?(t: ts.Type): boolean; isTupleType?(t: ts.Type): boolean };
  if (anyChecker.isArrayType?.(t) || anyChecker.isTupleType?.(t)) return { cat: 'array', nullable: false };
  if (t.getCallSignatures().length) return { cat: 'function', nullable: false };
  const name = t.getSymbol()?.getName();
  if (name === 'Promise' || name === 'PromiseLike') return { cat: 'promise', nullable: false };
  if (t.getProperties().some(p => p.getName().startsWith('__@iterator'))) return { cat: 'array', nullable: false };
  if (t.flags & F.Object) return { cat: 'object', nullable: false };
  return { nullable: false };
}

const types: Analyzer = ({ fileName, text }) => {
  const { sf, checker } = buildProgram(fileName, text);
  const out = empty();
  identifiers(sf, id => {
    const p = id.parent;
    if (ts.isTypeReferenceNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isImportSpecifier(p) || ts.isImportClause(p)) return;
    if (ts.isQualifiedName(p) || ts.isLabeledStatement(p) || ts.isExpressionWithTypeArguments(p)) return;
    if (ts.isPropertySignature(p) || ts.isClassDeclaration(p) || ts.isTypeParameterDeclaration(p)) return;
    const sym = symbolAt(checker, id);
    if (!sym || sym.flags & (ts.SymbolFlags.Type & ~ts.SymbolFlags.Class) && !(sym.flags & ts.SymbolFlags.Value)) return;
    let t: ts.Type;
    try { t = checker.getTypeAtLocation(id); } catch { return; }
    const { cat, nullable } = typeCategory(checker, t);
    if (cat) out.spans.push(span(sf, id, `t-${cat}`));
    if (nullable) out.spans.push(span(sf, id, 't-nullable'));
  });
  out.legend = [
    ['t-number', 'number'], ['t-string', 'string'], ['t-boolean', 'boolean'], ['t-array', 'array / iterable'],
    ['t-function', 'function'], ['t-promise', 'promise'], ['t-object', 'object'], ['t-mixed', 'several types (union)'],
    ['t-any', 'any / unknown'], ['t-nullable', 'may be null/undefined'],
  ].map(([style, label]) => ({ style, label }));
  return out;
};

// ---------------------------------------------------------------------------------------
// Exceptions: which functions can throw, and which call sites are unguarded.

const BUILTIN_THROWERS = new Set(['JSON.parse', 'decodeURIComponent', 'decodeURI', 'encodeURIComponent', 'atob', 'btoa', 'structuredClone', 'BigInt']);

function insideTry(n: ts.Node, stopAt: ts.Node | undefined): boolean {
  let child = n;
  for (let p = n.parent; p && p !== stopAt; child = p, p = p.parent) {
    if (isFunctionLike(p)) return false;
    if (ts.isTryStatement(p) && p.tryBlock === child && p.catchClause) return true;
  }
  return false;
}

function enclosingFunction(n: ts.Node): ts.SignatureDeclaration | undefined {
  for (let p = n.parent; p; p = p.parent) if (isFunctionLike(p)) return p;
  return undefined;
}

function functionName(fn: ts.SignatureDeclaration): ts.Node | undefined {
  if (fn.name) return fn.name;
  const p = fn.parent;
  if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return p.name;
  return undefined;
}

const exceptions: Analyzer = ({ fileName, text }) => {
  const { sf, checker } = buildProgram(fileName, text);
  const out = empty();

  /** The function-like declaration a call goes to, in any non-declaration file of the program. */
  const targetOf = (call: ts.CallExpression | ts.NewExpression): ts.SignatureDeclaration | undefined => {
    const e = call.expression;
    const id = ts.isPropertyAccessExpression(e) ? e.name : e;
    if (!ts.isIdentifier(id) && !ts.isPrivateIdentifier(id)) return undefined;
    let sym = checker.getSymbolAtLocation(id);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    for (const d of sym?.declarations ?? []) {
      if (d.getSourceFile().isDeclarationFile) continue;
      if (isFunctionLike(d) && 'body' in d && d.body) return d;
      if (ts.isVariableDeclaration(d) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) return d.initializer;
    }
    return undefined;
  };
  const isBuiltinThrower = (call: ts.CallExpression | ts.NewExpression) => BUILTIN_THROWERS.has(call.expression.getText(call.getSourceFile()));

  // Does `fn` let an exception escape? Memoized; recursion (cycles) assumed not to throw.
  const memo = new Map<ts.Node, boolean>();
  const throws = (fn: ts.SignatureDeclaration): boolean => {
    if (memo.has(fn)) return memo.get(fn)!;
    memo.set(fn, false);
    let result = false;
    const visit = (n: ts.Node) => {
      if (result || (n !== fn && isFunctionLike(n))) return;
      if (ts.isThrowStatement(n) && !insideTry(n, fn)) result = true;
      else if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && !insideTry(n, fn)) {
        const t = targetOf(n);
        if (isBuiltinThrower(n) || (t && throws(t))) result = true;
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(fn, visit);
    memo.set(fn, result);
    return result;
  };

  const visit = (n: ts.Node) => {
    if (ts.isThrowStatement(n)) out.spans.push({ start: n.getStart(sf), end: n.getStart(sf) + 5, style: 'throwStmt' });
    if (ts.isTryStatement(n) && n.catchClause) {
      const a = sf.getLineAndCharacterOfPosition(n.tryBlock.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(n.tryBlock.end).line;
      for (let l = a; l <= b; l++) out.lines.push({ line: l, style: 'tryBlock' });
    }
    if (isFunctionLike(n) && 'body' in n && n.body && throws(n)) {
      const name = functionName(n);
      if (name) out.spans.push(span(sf, name, 'throws'));
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const t = targetOf(n);
      if (isBuiltinThrower(n) || (t && throws(t))) {
        const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression;
        out.spans.push(span(sf, callee, insideTry(n, enclosingFunction(n)) ? 'caught' : 'throwsCall'));
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  out.legend = [
    { style: 'throws', label: 'function that can throw' },
    { style: 'throwsCall', label: 'unguarded call to a thrower' },
    { style: 'caught', label: 'call guarded by try/catch' },
    { style: 'throwStmt', label: 'throw' },
    { style: 'tryBlock', label: 'try block' },
  ];
  return out;
};

// ---------------------------------------------------------------------------------------
// Git: functions whose bodies changed on this branch, and every call to them.

const gitLens: Analyzer = ({ fileName, text, changedLines }) => {
  const { sf, checker } = buildProgram(fileName, text);
  const out = empty();
  out.legend = [
    { style: 'changedFn', label: 'function changed on this branch' },
    { style: 'changedCall', label: 'call to a changed function' },
    { style: 'changedBody', label: 'changed function body' },
  ];
  if (!changedLines || changedLines.size === 0) return out;
  const changedFns = new Set<ts.Node>();
  const fns: ts.SignatureDeclaration[] = [];
  const visit = (n: ts.Node) => {
    if (isFunctionLike(n) && 'body' in n && n.body) fns.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // Innermost function owning each changed line.
  for (const line of changedLines) {
    if (line >= sf.getLineStarts().length) continue;
    const pos = sf.getLineStarts()[line];
    let best: ts.SignatureDeclaration | undefined;
    for (const f of fns) {
      const a = sf.getLineAndCharacterOfPosition(f.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(f.end).line;
      if (line >= a && line <= b && (!best || f.getStart(sf) >= best.getStart(sf))) best = f;
    }
    if (best) changedFns.add(best);
    void pos;
  }
  for (const f of changedFns) {
    const name = functionName(f as ts.SignatureDeclaration);
    if (name) out.spans.push(span(sf, name, 'changedFn'));
    const a = sf.getLineAndCharacterOfPosition(f.getStart(sf)).line;
    const b = sf.getLineAndCharacterOfPosition(f.end).line;
    for (let l = a; l <= b; l++) out.lines.push({ line: l, style: 'changedBody' });
  }
  const callVisit = (n: ts.Node) => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const e = ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression;
      let sym = ts.isIdentifier(e) ? checker.getSymbolAtLocation(e) : undefined;
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      for (const d of sym?.declarations ?? []) {
        const target = ts.isVariableDeclaration(d) ? d.initializer : d;
        if (target && changedFns.has(target)) out.spans.push(span(sf, e, 'changedCall'));
      }
    }
    ts.forEachChild(n, callVisit);
  };
  callVisit(sf);
  return out;
};

export const ANALYZERS: Record<string, Analyzer> = {
  rainbow,
  context,
  imports,
  arguments: argumentsLens,
  types,
  exceptions,
  git: gitLens,
};

export function analyze(scheme: string, input: AnalyzeInput): Analysis {
  const fn = ANALYZERS[scheme];
  if (!fn) return empty();
  try {
    return fn(input);
  } catch (e) {
    console.error(`[lenses] ${scheme} analysis failed`, e);
    return empty();
  }
}
