import * as ts from 'typescript';
import { Analysis } from '../highlight/analyze';
import { parseOnly, tokens, comments } from '../highlight/program';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Render code as HTML, wrapping characters in `.s-<style>` classes from an analysis. */
export function renderAnalysis(text: string, a: Analysis): string {
  const classes: string[][] = Array.from({ length: text.length }, () => []);
  for (const s of a.spans) for (let i = s.start; i < s.end && i < text.length; i++) classes[i].push('s-' + s.style);
  return renderClasses(text, classes, a.lines.map(l => [l.line, 's-' + l.style] as [number, string]));
}

/** Ordinary keyword/string/number coloring, for the "no lens" example. */
export function renderSyntax(text: string, fileName = 'example.ts'): string {
  const sf = parseOnly(fileName, text);
  const classes: string[][] = Array.from({ length: text.length }, () => []);
  const mark = (a: number, b: number, c: string) => { for (let i = a; i < b; i++) classes[i].push(c); };
  const toks = tokens(sf);
  for (const t of toks) {
    const k = t.kind;
    const cls = ts.isStringLiteralLike(t) || ts.isTemplateLiteralToken(t) ? 'syn-str'
      : ts.isNumericLiteral(t) ? 'syn-num'
      : k >= ts.SyntaxKind.FirstKeyword && k <= ts.SyntaxKind.LastKeyword ? 'syn-kw'
      : ts.isIdentifier(t) && (ts.isCallExpression(t.parent) || ts.isFunctionDeclaration(t.parent)) ? 'syn-fn'
      : undefined;
    if (cls) mark(t.getStart(sf), t.end, cls);
  }
  for (const c of comments(sf, toks)) mark(c.pos, c.end, 'syn-com');
  return renderClasses(text, classes, []);
}

function renderClasses(text: string, classes: string[][], lineClasses: [number, string][]): string {
  const lines: string[] = [];
  let cur = '';
  let open = '';
  let line = 0;
  const flushLine = () => {
    if (open) cur += '</span>';
    const lc = lineClasses.filter(([l]) => l === line).map(([, c]) => c);
    lines.push(`<div class="ln ${lc.join(' ')}">${cur || ' '}</div>`);
    cur = '';
    open = '';
    line++;
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') { flushLine(); continue; }
    const c = classes[i].join(' ');
    if (c !== open) {
      if (open) cur += '</span>';
      if (c) cur += `<span class="${c}">`;
      open = c;
    }
    cur += esc(text[i]);
  }
  flushLine();
  return lines.join('');
}

export { esc };
