import * as prettier from 'prettier';
import * as ts from 'typescript';
import { styleById } from './styles';
import { align, tokenize } from './align';

// Canonical <-> display conversion. Canonical form is Prettier with the project's own config
// (.prettierrc etc.), which is what gets written to disk. Display styles start from Prettier's
// defaults, so a personal view doesn't inherit project settings.

const PARSERS: Record<string, string> = { ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', js: 'babel', jsx: 'babel', mjs: 'babel', cjs: 'babel' };

function parserFor(fileName: string): string {
  const ext = /\.([a-z]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'js';
  return PARSERS[ext] ?? 'babel';
}

/** `widthScale` shrinks every print width (used for the sidebar's miniature examples). */
export async function toDisplay(canonical: string, fileName: string, styleId: string, widthScale = 1): Promise<string> {
  const style = styleById(styleId);
  if (style.id === 'canonical') return canonical;
  const fromFile = style.configFile ? await loadConfigFile(style.configFile, fileName) : {};
  const options = { ...fromFile, ...style.prettier };
  const printWidth = Math.round(((options.printWidth as number | undefined) ?? 80) * widthScale);
  // Collapse objects that fit: a view shouldn't inherit layout hints from the stored file.
  let out = await prettier.format(canonical, { objectWrap: 'collapse', ...options, printWidth, parser: parserFor(fileName) });
  if (style.post) out = style.post(out, fileName);
  return out;
}

/** Options from a user-chosen Prettier config file, dropping keys that would break parsing. */
async function loadConfigFile(configFile: string, fileName: string): Promise<Record<string, unknown>> {
  const opts = await prettier.resolveConfig(fileName, { config: configFile, editorconfig: false });
  if (!opts) throw new Error(`Prettier config file not found or empty: ${configFile}`);
  const { parser, plugins, overrides, filepath, ...rest } = opts as Record<string, unknown>;
  void parser; void plugins; void overrides; void filepath;
  return rest;
}

export async function canonicalOptions(fileName: string): Promise<prettier.Options> {
  const config = (await prettier.resolveConfig(fileName, { editorconfig: true }).catch(() => null)) ?? {};
  return { ...config, parser: parserFor(fileName) };
}

// Prettier keeps an object literal expanded if its input has a newline right after `{`
// (objectWrap: "preserve"), so the canonical form would depend on which view it was saved
// from. Before formatting, reset each such brace's newline to what the previous canonical
// text had there; braces that are new get none.
const WRAPPABLE = new Set([ts.SyntaxKind.ObjectLiteralExpression, ts.SyntaxKind.ObjectBindingPattern, ts.SyntaxKind.TypeLiteral]);

export function restoreObjectWraps(display: string, previous: string, fileName: string): string {
  const a = tokenize(fileName, previous);
  const b = tokenize(fileName, display);
  const map = align(a, b);
  const expandedBefore = (i: number) => {
    const next = a[i + 1];
    return !!next && previous.slice(a[i].end, next.pos).includes('\n');
  };
  const edits: { pos: number; end: number; text: string }[] = [];
  b.forEach((t, j) => {
    if (t.kind !== ts.SyntaxKind.OpenBraceToken || !t.owner || !WRAPPABLE.has(t.owner) || !b[j + 1]) return;
    const want = map[j] >= 0 && expandedBefore(map[j]);
    const gap = display.slice(t.end, b[j + 1].pos);
    const has = gap.includes('\n');
    if (want && !has) edits.push({ pos: t.end, end: b[j + 1].pos, text: '\n' });
    if (!want && has && !/\/[/*]/.test(gap)) edits.push({ pos: t.end, end: b[j + 1].pos, text: ' ' });
  });
  let out = display;
  for (const e of edits.reverse()) out = out.slice(0, e.pos) + e.text + out.slice(e.end);
  return out;
}

export async function toCanonical(display: string, fileName: string, previous?: string): Promise<string> {
  const input = previous === undefined ? display : restoreObjectWraps(display, previous, fileName);
  return prettier.format(input, await canonicalOptions(fileName));
}

/** Whether the stored file already matches canonical form (otherwise the first save reformats it). */
export async function isCanonical(text: string, fileName: string): Promise<boolean> {
  try {
    return await prettier.check(text, await canonicalOptions(fileName));
  } catch {
    return false;
  }
}
