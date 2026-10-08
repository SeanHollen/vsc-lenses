import * as ts from 'typescript';
import { parseOnly } from '../highlight/program';

// Display styles, after Max Leiter's "Formatting is a solved problem": the file on disk keeps
// one canonical layout, and each reader views it in the layout they prefer.

export interface FormatStyle {
  id: string;
  name: string;
  description: string;
  /** Prettier options layered over Prettier's defaults (not the project's config). */
  prettier?: Record<string, unknown>;
  /** Text rewrite after Prettier. */
  post?: (text: string, fileName: string) => string;
  editor?: { tabSize: number; insertSpaces: boolean };
  /** A Prettier config file (e.g. a personal .prettierrc) whose options sit under `prettier`. */
  configFile?: string;
  /** Defined in the user's settings rather than built in. */
  custom?: boolean;
}

export const STYLES: FormatStyle[] = [
  {
    id: 'canonical',
    name: 'Canonical',
    description: 'Exactly what is stored on disk. Line numbers are the real ones.',
  },
  {
    id: 'wide',
    name: 'Wide',
    description: 'Long lines (120 columns). Fewer, denser lines for big monitors.',
    prettier: { printWidth: 120 },
  },
  {
    id: 'narrow',
    name: 'Narrow',
    description: 'Short lines (48 columns). For side-by-side panes and small screens; one canonical line often spans several.',
    prettier: { printWidth: 48 },
  },
  {
    id: 'minimal',
    name: 'Minimal punctuation',
    description: 'No semicolons, single quotes, no trailing commas, tight braces.',
    prettier: { semi: false, singleQuote: true, trailingComma: 'none', bracketSpacing: false, arrowParens: 'avoid' },
  },
  {
    id: 'tabs',
    name: 'Tabs, 4 wide',
    description: 'Indent with tabs, shown 4 columns wide.',
    prettier: { useTabs: true, tabWidth: 4 },
    editor: { tabSize: 4, insertSpaces: false },
  },
  {
    id: 'allman',
    name: 'Allman braces',
    description: 'Opening braces of blocks, functions and classes on their own line. else/catch start fresh lines.',
    prettier: { tabWidth: 4 },
    post: allman,
    editor: { tabSize: 4, insertSpaces: true },
  },
];

/** A user-defined style, as written in the `lenses.format.customStyles` setting. */
export interface CustomStyleConfig {
  id?: string;
  name: string;
  description?: string;
  /** Built-in (or earlier custom) style to start from. Defaults to Prettier's defaults. */
  extends?: string;
  /** Prettier options (https://prettier.io/docs/options), layered over `extends`. */
  prettier?: Record<string, unknown>;
  /** Path to a Prettier config file to load options from (`~` allowed). */
  prettierConfigFile?: string;
  /** `allman` puts block braces on their own lines; `same-line` turns that off. */
  braces?: 'same-line' | 'allman';
}

let custom: FormatStyle[] = [];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'style';

/** Turn setting entries into styles. Returns problems to show the user (bad entries are skipped). */
export function setCustomStyles(configs: CustomStyleConfig[], home = ''): string[] {
  const problems: string[] = [];
  const out: FormatStyle[] = [];
  for (const [i, c] of (Array.isArray(configs) ? configs : []).entries()) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) {
      problems.push(`customStyles[${i}] needs a "name"`);
      continue;
    }
    const id = 'custom:' + slug(c.id ?? c.name);
    if (out.some(s => s.id === id)) {
      problems.push(`customStyles[${i}]: duplicate id "${id}"`);
      continue;
    }
    const base = c.extends ? [...STYLES, ...out].find(s => s.id === c.extends || s.id === 'custom:' + c.extends) : undefined;
    if (c.extends && !base) problems.push(`customStyles[${i}] ("${c.name}"): unknown style "${c.extends}" in "extends"`);
    const post = c.braces === 'allman' ? allman : c.braces === 'same-line' ? undefined : base?.post;
    out.push({
      id,
      name: c.name,
      description: c.description ?? describe(c),
      prettier: { ...base?.prettier, ...c.prettier },
      post,
      configFile: c.prettierConfigFile?.replace(/^~(?=\/|$)/, home) ?? base?.configFile,
      custom: true,
    });
  }
  custom = out;
  return problems;
}

function describe(c: CustomStyleConfig): string {
  const parts = Object.entries(c.prettier ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  if (c.extends) parts.unshift(`based on ${c.extends}`);
  if (c.braces === 'allman') parts.push('Allman braces');
  if (c.prettierConfigFile) parts.push(`options from ${c.prettierConfigFile}`);
  return parts.length ? parts.join(', ') : "Prettier's defaults";
}

export const allStyles = (): FormatStyle[] => [...STYLES, ...custom];

export const styleById = (id: string) => allStyles().find(s => s.id === id) ?? STYLES[0];

/** Move block-opening braces onto their own line (arrow-function bodies excepted). */
export function allman(text: string, fileName: string): string {
  const sf = parseOnly(fileName, text);
  const lineStarts = sf.getLineStarts();
  const indentOf = (pos: number) => {
    const line = sf.getLineAndCharacterOfPosition(pos).line;
    return /^[ \t]*/.exec(text.slice(lineStarts[line]))![0];
  };
  const edits: { pos: number; end: number; insert: string }[] = [];
  const breakBefore = (pos: number) => {
    let ws = pos;
    while (ws > 0 && (text[ws - 1] === ' ' || text[ws - 1] === '\t')) ws--;
    if (ws === 0 || text[ws - 1] === '\n') return; // already starts a line
    edits.push({ pos: ws, end: pos, insert: '\n' + indentOf(pos) });
  };
  const openBrace = (n: ts.Node) => n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.OpenBraceToken);
  const visit = (n: ts.Node) => {
    let brace: ts.Node | undefined;
    if (ts.isBlock(n) && !ts.isArrowFunction(n.parent)) brace = openBrace(n);
    else if (ts.isClassLike(n) || ts.isInterfaceDeclaration(n) || ts.isEnumDeclaration(n) || ts.isModuleBlock(n) || ts.isCaseBlock(n)) brace = openBrace(n);
    if (brace) {
      const close = n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.CloseBraceToken);
      const empty = close && close.getStart(sf) === brace.end;
      if (!empty) breakBefore(brace.getStart(sf));
    }
    // `} else`, `} catch`, `} finally`, `} while`
    if (ts.isIfStatement(n) && n.elseStatement) {
      const elseKw = n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.ElseKeyword);
      if (elseKw) breakBefore(elseKw.getStart(sf));
    }
    if (ts.isTryStatement(n)) {
      if (n.catchClause) breakBefore(n.catchClause.getStart(sf));
      if (n.finallyBlock) {
        const kw = n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.FinallyKeyword);
        if (kw) breakBefore(kw.getStart(sf));
      }
    }
    if (ts.isDoStatement(n)) {
      const kw = n.getChildren(sf).find(c => c.kind === ts.SyntaxKind.WhileKeyword);
      if (kw) breakBefore(kw.getStart(sf));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.pos - a.pos);
  let out = text;
  for (const e of edits) out = out.slice(0, e.pos) + e.insert + out.slice(e.end);
  return out;
}
