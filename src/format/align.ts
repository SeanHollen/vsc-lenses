import * as ts from 'typescript';
import { diffArrays } from 'diff';
import { comments, parseOnly, tokens } from '../highlight/program';

// Token alignment between two layouts of the same program. Formatting only moves tokens
// between lines (plus optional punctuation such as `;`, `,` and parens), so after dropping
// that punctuation the streams are nearly identical and an LCS diff aligns them.

export interface Tok {
  key: string;
  pos: number;
  end: number;
  line: number;
  /** Last line the token touches (multi-line strings, templates, comments). */
  endLine: number;
  kind: ts.SyntaxKind;
  /** For `{` tokens: the kind of node it opens. */
  owner?: ts.SyntaxKind;
}

const OPTIONAL = new Set([
  ts.SyntaxKind.SemicolonToken,
  ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.CloseParenToken,
]);

function keyOf(sf: ts.SourceFile, t: ts.Node): string {
  if (ts.isStringLiteral(t) || ts.isNoSubstitutionTemplateLiteral(t)) return 's:' + t.text;
  if (ts.isNumericLiteral(t)) return 'n:' + Number(t.text.replace(/_/g, ''));
  return t.kind + ':' + t.getText(sf);
}

export function tokenize(fileName: string, text: string): Tok[] {
  const sf = parseOnly(fileName, text);
  const toks = tokens(sf);
  const out: Omit<Tok, 'line' | 'endLine'>[] = [];
  for (const t of toks) {
    if (OPTIONAL.has(t.kind)) continue;
    const pos = t.getStart(sf);
    out.push({ key: keyOf(sf, t), pos, end: t.end, kind: t.kind, owner: t.kind === ts.SyntaxKind.OpenBraceToken ? t.parent.kind : undefined });
  }
  for (const c of comments(sf, toks)) {
    out.push({ key: 'c:' + text.slice(c.pos, c.end).replace(/\s+/g, ' ').trim(), pos: c.pos, end: c.end, kind: ts.SyntaxKind.MultiLineCommentTrivia });
  }
  out.sort((a, b) => a.pos - b.pos);
  return out.map(o => ({ ...o, line: sf.getLineAndCharacterOfPosition(o.pos).line, endLine: sf.getLineAndCharacterOfPosition(o.end).line }));
}

/** For each token of `b`, the index of the matching token in `a`, or -1 if it's new. */
export function align(a: Tok[], b: Tok[]): number[] {
  const mapped = new Array<number>(b.length).fill(-1);
  let i = 0;
  let j = 0;
  for (const part of diffArrays(a.map(t => t.key), b.map(t => t.key))) {
    const n = part.count ?? part.value.length;
    if (part.added) j += n;
    else if (part.removed) i += n;
    else for (let k = 0; k < n; k++) mapped[j++] = i++;
  }
  return mapped;
}
