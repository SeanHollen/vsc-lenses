import * as vscode from 'vscode';
import { ProjectionFS, SCHEME, toFileUri, toLensUri } from './fsProvider';
import { buildLineMap, LineMap } from './lineMap';
import { styleById } from './styles';
import { toCanonical } from './project';

export const isJsTs = (doc: vscode.TextDocument) =>
  ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(doc.languageId) ||
  /\.[cm]?[jt]sx?$/i.test(doc.uri.path);

export class FormatController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly maps = new Map<string, LineMap>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly gutter = vscode.window.createTextEditorDecorationType({
    before: {
      color: new vscode.ThemeColor('editorLineNumber.foreground'),
      margin: '0 1.2ch 0 0',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  /** "Can't be canonicalized yet" errors. Besides informing the user, an error marker makes
   *  `files.autoSaveWhenNoErrors` hold auto-save until the code parses again. */
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('lenses');
  private readonly onMapEmitter = new vscode.EventEmitter<vscode.TextDocument>();
  /** Fired when a projected document's line map is rebuilt. */
  readonly onDidUpdateMap = this.onMapEmitter.event;
  private swapping = false;
  private readonly pendingRestore = new Map<string, { cursor: number; top: number }>();
  private readonly saveReasons = new Map<string, vscode.TextDocumentSaveReason>();
  /** Styled views auto-saved mid-typing whose layout hasn't been re-projected yet. */
  private readonly untidy = new Set<vscode.TextDocument>();

  constructor(readonly fs: ProjectionFS, private readonly style: () => string, private readonly autoProject: () => boolean) {
    this.status.command = 'lenses.gotoCanonicalLine';
    this.disposables.push(
      this.gutter,
      this.status,
      this.diagnostics,
      vscode.workspace.onDidCloseTextDocument(d => this.diagnostics.delete(d.uri)),
      vscode.window.onDidChangeActiveTextEditor(e => { if (e) this.decorate(e); this.onActive(e); }),
      vscode.window.onDidChangeVisibleTextEditors(es => es.forEach(e => this.decorate(e))),
      vscode.window.onDidChangeTextEditorSelection(e => this.updateStatus(e.textEditor)),
      vscode.workspace.onDidChangeTextDocument(e => e.document.uri.scheme === SCHEME && this.schedule(e.document)),
      vscode.workspace.onDidOpenTextDocument(d => d.uri.scheme === SCHEME && this.schedule(d, 0)),
      vscode.workspace.onWillSaveTextDocument(e => e.document.uri.scheme === SCHEME && this.saveReasons.set(e.document.uri.toString(), e.reason)),
      vscode.workspace.onDidSaveTextDocument(d => d.uri.scheme === SCHEME && this.afterSave(d)),
      // Tidy views that were auto-saved while typing once the user moves on.
      vscode.window.onDidChangeActiveTextEditor(() => this.tidyPending()),
      vscode.window.onDidChangeWindowState(w => !w.focused && this.tidyPending()),
    );
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}');
    this.disposables.push(watcher, watcher.onDidChange(u => this.fs.fileChanged(u)));
    for (const d of vscode.workspace.textDocuments) if (d.uri.scheme === SCHEME) this.schedule(d, 0);
    this.onActive(vscode.window.activeTextEditor);
  }

  mapFor(doc: vscode.TextDocument): LineMap | undefined {
    return this.maps.get(doc.uri.toString());
  }

  // --- swapping editors between file: and lens-fmt: ------------------------------------

  private async onActive(editor: vscode.TextEditor | undefined) {
    if (!editor) return this.status.hide();
    this.updateStatus(editor);
    if (this.swapping || !this.autoProject()) return;
    const doc = editor.document;
    if (doc.uri.scheme === 'file' && isJsTs(doc) && this.style() !== 'canonical' && !doc.isDirty) {
      await this.swap(editor, toLensUri(doc.uri));
    } else if (doc.uri.scheme === SCHEME && this.style() === 'canonical' && !doc.isDirty) {
      // A styled tab restored from elsewhere (e.g. Tabs Per Mode) after switching to Canonical.
      await this.swap(editor, toFileUri(doc.uri));
    }
  }

  /** Re-target every open JS/TS editor at the current style. */
  async applyStyleToOpenEditors() {
    // Remember where each projected editor was, in canonical lines, to restore after reload.
    for (const e of vscode.window.visibleTextEditors) {
      if (e.document.uri.scheme !== SCHEME) continue;
      const top = e.visibleRanges[0]?.start.line ?? 0;
      this.pendingRestore.set(e.document.uri.toString(), {
        cursor: this.toCanonicalLine(e.document, e.selection.active.line),
        top: this.toCanonicalLine(e.document, top),
      });
    }
    this.fs.styleChanged();
    const projected = this.style() !== 'canonical';
    for (const editor of [...vscode.window.visibleTextEditors]) {
      const doc = editor.document;
      if (!projected && doc.uri.scheme === SCHEME && !doc.isDirty) await this.swap(editor, toFileUri(doc.uri));
      else if (projected && this.autoProject() && doc.uri.scheme === 'file' && isJsTs(doc) && !doc.isDirty) await this.swap(editor, toLensUri(doc.uri));
    }
    for (const d of vscode.workspace.textDocuments) if (d.uri.scheme === SCHEME) this.schedule(d, 50);
  }

  /** Open `target` in place of `editor`'s tab, keeping the cursor on the same canonical line. */
  async swap(editor: vscode.TextEditor, target: vscode.Uri) {
    const from = editor.document;
    const canonicalLine = from.uri.scheme === SCHEME ? this.toCanonicalLine(from, editor.selection.active.line) : editor.selection.active.line;
    const tab = vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input instanceof vscode.TabInputText && t.input.uri.toString() === from.uri.toString());
    this.swapping = true;
    try {
      const doc = await vscode.workspace.openTextDocument(target);
      const shown = await vscode.window.showTextDocument(doc, { viewColumn: editor.viewColumn, preview: tab?.isPreview ?? false });
      if (tab) await vscode.window.tabGroups.close(tab, true);
      let line = canonicalLine;
      if (target.scheme === SCHEME) {
        await this.rebuild(doc);
        line = this.toDisplayLine(doc, canonicalLine);
      }
      const pos = new vscode.Position(Math.min(line, doc.lineCount - 1), 0);
      shown.selection = new vscode.Selection(pos, pos);
      shown.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      this.decorate(shown);
    } finally {
      this.swapping = false;
    }
  }

  async openCanonical() {
    const e = vscode.window.activeTextEditor;
    if (e?.document.uri.scheme === SCHEME) {
      this.swapping = true; // don't bounce straight back into the projection
      try { await this.swap(e, toFileUri(e.document.uri)); } finally { this.swapping = false; }
    }
  }

  async openProjected() {
    const e = vscode.window.activeTextEditor;
    if (e && e.document.uri.scheme === 'file' && isJsTs(e.document)) {
      if (this.style() === 'canonical') {
        vscode.window.showInformationMessage('Pick a display style other than Canonical first.');
        return;
      }
      await this.swap(e, toLensUri(e.document.uri));
    }
  }

  /** After saving a styled view, show the saved code in the current style (like format-on-save).
   *  VS Code ignores change events from its own save, so the reload must be forced. */
  private async afterSave(doc: vscode.TextDocument) {
    const reason = this.saveReasons.get(doc.uri.toString());
    this.saveReasons.delete(doc.uri.toString());
    if (reason === vscode.TextDocumentSaveReason.AfterDelay && vscode.window.activeTextEditor?.document === doc) {
      // Timed auto-save while typing: disk is canonical now, but don't reflow under the cursor.
      this.untidy.add(doc);
      this.schedule(doc, 0);
      return;
    }
    this.untidy.delete(doc);
    await this.reprojectIfStale(doc);
  }

  private tidyPending() {
    for (const doc of [...this.untidy]) {
      if (doc.isClosed) { this.untidy.delete(doc); continue; }
      if (vscode.window.activeTextEditor?.document === doc || doc.isDirty) continue;
      this.untidy.delete(doc);
      void this.reprojectIfStale(doc);
    }
  }

  private async reprojectIfStale(doc: vscode.TextDocument) {
    const display = await this.fs.display(doc.uri).catch(() => undefined);
    if (display !== undefined && display !== doc.getText() && !doc.isDirty) {
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) {
        this.pendingRestore.set(doc.uri.toString(), {
          cursor: this.toCanonicalLine(doc, editor.selection.active.line),
          top: this.toCanonicalLine(doc, editor.visibleRanges[0]?.start.line ?? 0),
        });
      }
      this.fs.reproject(doc.uri);
    }
  }

  // --- line map + gutter ----------------------------------------------------------------

  private schedule(doc: vscode.TextDocument, delay = 150) {
    const k = doc.uri.toString();
    clearTimeout(this.timers.get(k));
    this.timers.set(k, setTimeout(() => this.rebuild(doc), delay));
  }

  private async rebuild(doc: vscode.TextDocument) {
    if (doc.isClosed) return;
    let canonical: string;
    try { canonical = await this.fs.canonical(doc.uri); } catch { return; }
    const map = buildLineMap(doc.uri.fsPath, canonical, doc.getText());
    this.maps.set(doc.uri.toString(), map);
    void this.checkSavable(doc, canonical);
    const restore = this.pendingRestore.get(doc.uri.toString());
    this.pendingRestore.delete(doc.uri.toString());
    for (const e of vscode.window.visibleTextEditors) {
      if (e.document !== doc) continue;
      this.decorate(e);
      if (restore) {
        const cursor = new vscode.Position(this.toDisplayLine(doc, restore.cursor), 0);
        e.selection = new vscode.Selection(cursor, cursor);
        e.revealRange(new vscode.Range(this.toDisplayLine(doc, restore.top), 0, this.toDisplayLine(doc, restore.top), 0), vscode.TextEditorRevealType.AtTop);
      }
    }
    this.onMapEmitter.fire(doc);
  }

  private async checkSavable(doc: vscode.TextDocument, canonical: string) {
    const version = doc.version;
    let problem: vscode.Diagnostic | undefined;
    try {
      await toCanonical(doc.getText(), doc.uri.fsPath, canonical);
    } catch (e) {
      const err = e as Error & { loc?: { start: { line: number; column: number } } };
      const line = Math.max(0, (err.loc?.start.line ?? 1) - 1);
      const col = Math.max(0, (err.loc?.start.column ?? 1) - 1);
      const range = doc.validateRange(new vscode.Range(line, col, line, col + 1));
      problem = new vscode.Diagnostic(range, `Not saved yet: can't convert to canonical form until this parses. ${String(err.message).split('\n')[0]}`, vscode.DiagnosticSeverity.Error);
      problem.source = 'lenses';
    }
    if (doc.isClosed || doc.version !== version) return;
    this.diagnostics.set(doc.uri, problem ? [problem] : []);
  }

  private decorate(editor: vscode.TextEditor) {
    const doc = editor.document;
    if (doc.uri.scheme !== SCHEME) {
      // The editor widget may be reused from a projected view, keeping its hidden line numbers
      // (and the extension host can't tell), so set them from the user's setting explicitly.
      if (isJsTs(doc)) {
        const setting = vscode.workspace.getConfiguration('editor', doc).get<string>('lineNumbers', 'on');
        const style = { on: vscode.TextEditorLineNumbersStyle.On, relative: vscode.TextEditorLineNumbersStyle.Relative, interval: vscode.TextEditorLineNumbersStyle.Interval }[setting];
        if (style !== undefined) editor.options = { lineNumbers: style };
      }
      return;
    }
    const style = styleById(this.style());
    editor.options = {
      lineNumbers: vscode.TextEditorLineNumbersStyle.Off,
      tabSize: style.editor?.tabSize ?? ((style.prettier?.tabWidth as number | undefined) ?? 2),
      insertSpaces: style.editor?.insertSpaces ?? !style.prettier?.useTabs,
    };
    const map = this.maps.get(doc.uri.toString());
    if (!map) return;
    const width = Math.max(3, ...map.labels.map(l => l.length));
    const decos: vscode.DecorationOptions[] = [];
    for (let line = 0; line < doc.lineCount && line < map.labels.length; line++) {
      const label = map.continuation[line] ? '┆' : map.labels[line];
      decos.push({
        range: new vscode.Range(line, 0, line, 0),
        renderOptions: {
          before: {
            contentText: label.padStart(width, ' '),
            color: map.continuation[line] ? new vscode.ThemeColor('editorIndentGuide.activeBackground1') : label === '+' ? new vscode.ThemeColor('editorGutter.addedBackground') : undefined,
          },
        },
      });
    }
    editor.setDecorations(this.gutter, decos);
  }

  toCanonicalLine(doc: vscode.TextDocument, displayLine: number): number {
    const map = this.maps.get(doc.uri.toString());
    if (!map) return displayLine;
    for (let l = displayLine; l >= 0; l--) if (map.displayToCanonical[l] >= 0) return map.displayToCanonical[l];
    return 0;
  }

  toDisplayLine(doc: vscode.TextDocument, canonicalLine: number): number {
    const map = this.maps.get(doc.uri.toString());
    if (!map) return canonicalLine;
    return map.canonicalToDisplay[Math.min(canonicalLine, map.canonicalToDisplay.length - 1)] ?? canonicalLine;
  }

  private updateStatus(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.uri.scheme !== SCHEME) {
      this.status.hide();
      return;
    }
    const doc = editor.document;
    const line = editor.selection.active.line;
    const canonical = this.toCanonicalLine(doc, line) + 1;
    const err = this.fs.errors.get(toFileUri(doc.uri).fsPath);
    this.status.text = `$(symbol-ruler) ${styleById(this.style()).name} · canonical Ln ${canonical}`;
    this.status.tooltip = err
      ? err.kind === 'syntax' ? `Showing the file verbatim: it couldn't be parsed (${err.message})` : `Showing the file verbatim: the "${styleById(this.style()).name}" style has a problem (${err.message})`
      : `Viewing in "${styleById(this.style()).name}" style. Display line ${line + 1} is canonical line ${canonical}. Click to go to a canonical line.`;
    this.status.show();
  }

  async gotoCanonicalLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const input = await vscode.window.showInputBox({ prompt: 'Go to canonical (on-disk) line number', validateInput: v => (/^\d+$/.test(v) ? undefined : 'Enter a line number') });
    if (!input) return;
    const canonical = parseInt(input, 10) - 1;
    const line = editor.document.uri.scheme === SCHEME ? this.toDisplayLine(editor.document, canonical) : canonical;
    const pos = new vscode.Position(Math.max(0, Math.min(line, editor.document.lineCount - 1)), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    this.disposables.forEach(d => d.dispose());
  }
}
