import * as ts from 'typescript';

// Builds a ts.Program around one in-memory file so the checker can resolve symbols and types.
// Old programs are reused so lib.d.ts and imported files are parsed only once.

const OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  checkJs: false,
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

const cache = new Map<string, ts.Program>();

export function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.[cm]?ts$/i.test(fileName)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

export function parseOnly(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
}

export function buildProgram(fileName: string, text: string): { program: ts.Program; sf: ts.SourceFile; checker: ts.TypeChecker } {
  const host = ts.createCompilerHost(OPTIONS, true);
  const norm = (f: string) => f.replace(/\\/g, '/');
  const target = norm(fileName);
  const origGet = host.getSourceFile.bind(host);
  host.getSourceFile = (f, lang, onErr, create) => {
    if (norm(f) === target) return ts.createSourceFile(f, text, lang, true, scriptKind(f));
    const old = cache.get(target)?.getSourceFile(f);
    return old ?? origGet(f, lang, onErr, create);
  };
  const origExists = host.fileExists.bind(host);
  host.fileExists = f => norm(f) === target || origExists(f);
  const origRead = host.readFile.bind(host);
  host.readFile = f => (norm(f) === target ? text : origRead(f));

  const program = ts.createProgram({ rootNames: [fileName], options: OPTIONS, host, oldProgram: cache.get(target) });
  cache.set(target, program);
  const sf = program.getSourceFile(fileName)!;
  // Make sure the parent pointers exist for files created by the default host.
  return { program, sf, checker: program.getTypeChecker() };
}

/** Every token in source order (via getChildren, so template literals and regexes are handled). */
export function tokens(sf: ts.SourceFile): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (n.kind >= ts.SyntaxKind.FirstToken && n.kind <= ts.SyntaxKind.LastToken) {
      out.push(n);
      return;
    }
    const kids = n.getChildren(sf);
    if (kids.length === 0) {
      out.push(n);
      return;
    }
    kids.forEach(visit);
  };
  visit(sf);
  return out.filter(t => t.kind !== ts.SyntaxKind.EndOfFileToken && t.kind !== ts.SyntaxKind.SyntaxList);
}

export interface Comment { pos: number; end: number }

/** Comments, found as trivia attached to tokens. */
export function comments(sf: ts.SourceFile, toks: ts.Node[]): Comment[] {
  const text = sf.text;
  const seen = new Set<number>();
  const out: Comment[] = [];
  const add = (ranges: ts.CommentRange[] | undefined) => {
    for (const r of ranges ?? []) if (!seen.has(r.pos)) { seen.add(r.pos); out.push({ pos: r.pos, end: r.end }); }
  };
  for (const t of toks) add(ts.getLeadingCommentRanges(text, t.pos));
  add(ts.getLeadingCommentRanges(text, sf.endOfFileToken.pos));
  if (toks.length) add(ts.getTrailingCommentRanges(text, toks[toks.length - 1].end));
  return out.sort((a, b) => a.pos - b.pos);
}
