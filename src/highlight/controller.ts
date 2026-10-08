import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { analyze, Analysis } from './analyze';
import { comments, parseOnly, tokens } from './program';
import { Look, STYLES } from '../styles';
import { isJsTs } from '../format/controller';
import { SCHEME } from '../format/fsProvider';
import type { FormatController } from '../format/controller';

function toRenderOptions(l: Look): vscode.ThemableDecorationRenderOptions {
  const o: vscode.ThemableDecorationRenderOptions = {};
  if (l.color) o.color = l.color;
  if (l.background) o.backgroundColor = l.background;
  if (l.bold) o.fontWeight = 'bold';
  if (l.italic) o.fontStyle = 'italic';
  if (l.underline) o.textDecoration = `underline ${l.underline} ${l.underlineColor ?? 'currentColor'}`;
  if (l.border) {
    o.outline = l.border;
    o.borderRadius = '2px';
  }
  return o;
}

function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise(resolve => execFile(cmd, args, { cwd, maxBuffer: 16 << 20 }, (err, out) => resolve(err ? '' : out)));
}

/** Lines (0-based, canonical) of `file` that differ from the base branch, incl. uncommitted edits. */
async function changedLines(file: string): Promise<Set<number> | undefined> {
  const cwd = path.dirname(file);
  const root = (await run('git', ['rev-parse', '--show-toplevel'], cwd)).trim();
  if (!root) return undefined;
  let base = 'HEAD';
  for (const b of ['origin/HEAD', 'main', 'master', 'origin/main', 'origin/master']) {
    const mb = (await run('git', ['merge-base', 'HEAD', b], cwd)).trim();
    if (mb) { base = mb; break; }
  }
  const tracked = (await run('git', ['ls-files', '--error-unmatch', file], cwd)).trim();
  const lines = new Set<number>();
  if (!tracked) {
    // Untracked: everything is new on this branch.
    const n = (await vscode.workspace.fs.readFile(vscode.Uri.file(file))).toString().split('\n').length;
    for (let i = 0; i < n; i++) lines.add(i);
    return lines;
  }
  const diff = await run('git', ['diff', '--unified=0', '--no-color', base, '--', file], cwd);
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = parseInt(m[1], 10);
    const count = m[2] === undefined ? 1 : parseInt(m[2], 10);
    if (count === 0) lines.add(Math.max(0, start - 1)); // pure deletion: mark the line it was next to
    for (let i = 0; i < count; i++) lines.add(start - 1 + i);
  }
  return lines;
}

export class HighlightController implements vscode.Disposable {
  private readonly types = new Map<string, vscode.TextEditorDecorationType>();
  private readonly mute: vscode.TextEditorDecorationType;
  private readonly comment: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly gitCache = new Map<string, Set<number> | undefined>();
  private readonly results = new Map<string, Analysis>();
  private readonly emitter = new vscode.EventEmitter<void>();
  /** Fired after the active editor is re-analyzed (the sidebar legend listens). */
  readonly onDidAnalyze = this.emitter.event;

  constructor(private readonly scheme: () => string, private readonly muteSyntax: () => boolean, private readonly format: FormatController) {
    // Plain CSS variables, not ThemeColor: VS Code emits ThemeColor decoration colors as
    // !important, which would beat the (theme-scoped, more specific) lens colors.
    this.mute = vscode.window.createTextEditorDecorationType({ color: 'var(--vscode-editor-foreground)' });
    this.comment = vscode.window.createTextEditorDecorationType({ color: 'var(--vscode-editorLineNumber-foreground)', fontStyle: 'italic' });
    for (const [key, pair] of Object.entries(STYLES)) {
      this.types.set(key, vscode.window.createTextEditorDecorationType({
        isWholeLine: !!pair.dark.wholeLine,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        dark: toRenderOptions(pair.dark),
        light: toRenderOptions(pair.light),
      }));
    }
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(es => es.forEach(e => this.schedule(e.document, 0))),
      vscode.window.onDidChangeActiveTextEditor(() => this.emitter.fire()),
      vscode.workspace.onDidChangeTextDocument(e => this.schedule(e.document)),
      vscode.workspace.onDidSaveTextDocument(d => { this.gitCache.clear(); this.schedule(d, 0); }),
      format.onDidUpdateMap(d => this.scheme() === 'git' && this.schedule(d, 0)),
    );
    this.refreshAll();
  }

  refreshAll() {
    this.gitCache.clear();
    for (const e of vscode.window.visibleTextEditors) this.schedule(e.document, 0);
  }

  legendFor(doc: vscode.TextDocument | undefined): Analysis['legend'] {
    return doc ? this.results.get(doc.uri.toString())?.legend ?? [] : [];
  }

  private schedule(doc: vscode.TextDocument, delay = 250) {
    if (!isJsTs(doc) || (doc.uri.scheme !== 'file' && doc.uri.scheme !== SCHEME && doc.uri.scheme !== 'untitled')) return;
    const k = doc.uri.toString();
    clearTimeout(this.timers.get(k));
    this.timers.set(k, setTimeout(() => this.update(doc), delay));
  }

  private async update(doc: vscode.TextDocument) {
    if (doc.isClosed) return;
    const editors = vscode.window.visibleTextEditors.filter(e => e.document === doc);
    const scheme = this.scheme();
    if (scheme === 'none') {
      for (const e of editors) this.clear(e);
      this.results.delete(doc.uri.toString());
      this.emitter.fire();
      return;
    }
    const version = doc.version;
    let changed: Set<number> | undefined;
    if (scheme === 'git' && doc.uri.scheme !== 'untitled') {
      const file = doc.uri.fsPath;
      if (!this.gitCache.has(file)) this.gitCache.set(file, await changedLines(file));
      changed = this.gitCache.get(file);
      if (changed && doc.uri.scheme === SCHEME) {
        // Diff is in canonical lines; translate to the projected display.
        const map = this.format.mapFor(doc);
        if (map) {
          const display = new Set<number>();
          map.displayToCanonical.forEach((c, d) => { if (changed!.has(c)) display.add(d); });
          changed = display;
        }
      }
    }
    if (doc.version !== version) return; // stale; a newer update is scheduled
    const text = doc.getText();
    const result = analyze(scheme, { fileName: doc.uri.fsPath || doc.uri.path, text, changedLines: changed });
    this.results.set(doc.uri.toString(), result);

    const byStyle = new Map<string, vscode.Range[]>();
    const add = (style: string, r: vscode.Range) => {
      if (!byStyle.has(style)) byStyle.set(style, []);
      byStyle.get(style)!.push(r);
    };
    for (const s of result.spans) add(s.style, new vscode.Range(doc.positionAt(s.start), doc.positionAt(s.end)));
    for (const l of result.lines) add(l.style, new vscode.Range(l.line, 0, l.line, 0));

    const muted = this.muteSyntax();
    const commentRanges: vscode.Range[] = [];
    if (muted) {
      const sf = parseOnly(doc.uri.fsPath || 'x.ts', text);
      for (const c of comments(sf, tokens(sf))) commentRanges.push(new vscode.Range(doc.positionAt(c.pos), doc.positionAt(c.end)));
    }
    for (const e of vscode.window.visibleTextEditors.filter(x => x.document === doc)) {
      e.setDecorations(this.mute, muted ? [new vscode.Range(0, 0, doc.lineCount, 0)] : []);
      e.setDecorations(this.comment, commentRanges);
      for (const [key, type] of this.types) e.setDecorations(type, byStyle.get(key) ?? []);
    }
    this.emitter.fire();
  }

  private clear(e: vscode.TextEditor) {
    e.setDecorations(this.mute, []);
    e.setDecorations(this.comment, []);
    for (const t of this.types.values()) e.setDecorations(t, []);
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    this.disposables.forEach(d => d.dispose());
    this.types.forEach(t => t.dispose());
    this.mute.dispose();
    this.comment.dispose();
  }
}
