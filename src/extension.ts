import * as vscode from 'vscode';
import * as prettier from 'prettier';
import { ProjectionFS, SCHEME, toFileUri } from './format/fsProvider';
import { FormatController, isJsTs } from './format/controller';
import { HighlightController } from './highlight/controller';
import { HighlightView } from './views/highlightView';
import { FormatView, FormatState } from './views/formatView';
import { SCHEMES, schemeById } from './highlight/schemes';
import * as os from 'node:os';
import { allStyles, CustomStyleConfig, setCustomStyles, styleById } from './format/styles';
import { isCanonical } from './format/project';
import { DIFFERENCES } from './differences';

const cfg = () => vscode.workspace.getConfiguration('lenses');

export function activate(context: vscode.ExtensionContext) {
  // Turning a feature off makes it behave as its "plain VS Code" choice.
  const highlightOn = () => cfg().get<boolean>('highlight.enabled', true);
  const formatOn = () => cfg().get<boolean>('format.enabled', true);
  const scheme = () => highlightOn() ? cfg().get<string>('highlight.scheme', 'none') : 'none';
  const mute = () => cfg().get<boolean>('highlight.muteSyntax', true);
  const style = () => formatOn() ? cfg().get<string>('format.style', 'canonical') : 'canonical';
  const autoProject = () => cfg().get<boolean>('format.autoProject', true);
  const set = (key: string, value: unknown) => cfg().update(key, value, vscode.ConfigurationTarget.Global);
  // Choosing a lens or format (palette, status bar) turns that feature back on if it was off.
  const setHighlight = async (id: string) => { if (!highlightOn()) await set('highlight.enabled', true); await set('highlight.scheme', id); };
  const setFormat = async (id: string) => { if (!formatOn()) await set('format.enabled', true); await set('format.style', id); };

  // Custom styles must be registered before anything projects a document.
  const loadCustomStyles = () => {
    const problems = setCustomStyles(cfg().get<CustomStyleConfig[]>('format.customStyles', []), os.homedir());
    if (problems.length) vscode.window.showWarningMessage(`Lenses custom styles: ${problems.join('; ')}`, 'Edit Settings').then(a => a && vscode.commands.executeCommand('lenses.editCustomStyles'));
  };
  loadCustomStyles();

  const fs = new ProjectionFS(style);
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(SCHEME, fs, { isCaseSensitive: true }));

  const format = new FormatController(fs, style, autoProject);
  const highlight = new HighlightController(scheme, mute, format);
  context.subscriptions.push(format, highlight);

  const activeJsTs = () => {
    const doc = vscode.window.activeTextEditor?.document;
    return doc && isJsTs(doc) ? doc : undefined;
  };

  const highlightView = new HighlightView(
    () => {
      const doc = activeJsTs();
      return { scheme: scheme(), mute: mute(), legend: highlight.legendFor(doc), file: doc ? vscode.workspace.asRelativePath(toFileUri(doc.uri)) : undefined };
    },
    id => set('highlight.scheme', id),
    v => set('highlight.muteSyntax', v),
  );

  const formatState = async (): Promise<FormatState> => {
    const doc = activeJsTs();
    const state: FormatState = { style: style(), autoProject: autoProject() };
    if (!doc) return state;
    const file = toFileUri(doc.uri);
    state.file = vscode.workspace.asRelativePath(file);
    const configFile = await prettier.resolveConfigFile(file.fsPath).catch(() => null);
    state.canonicalSource = configFile ? vscode.workspace.asRelativePath(configFile) : 'default settings';
    try {
      const disk = new TextDecoder().decode(await vscode.workspace.fs.readFile(file));
      const err = fs.errors.get(file.fsPath);
      if (err?.kind === 'style') state.styleError = err.message;
      state.canonical = err?.kind === 'syntax' ? 'error' : (await isCanonical(disk, file.fsPath)) ? 'yes' : 'no';
      const map = doc.uri.scheme === SCHEME ? format.mapFor(doc) : undefined;
      state.lines = { canonical: disk.split('\n').length, display: doc.lineCount };
      if (map) state.lines.canonical = map.canonicalLineCount;
    } catch {
      state.canonical = 'error';
    }
    return state;
  };
  const formatView = new FormatView(
    formatState,
    id => set('format.style', id),
    v => set('format.autoProject', v),
    c => vscode.commands.executeCommand(c),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HighlightView.id, highlightView),
    vscode.window.registerWebviewViewProvider(FormatView.id, formatView),
    highlight.onDidAnalyze(() => highlightView.refresh()),
    format.onDidUpdateMap(() => formatView.refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => { highlightView.refresh(); formatView.refresh(); }),
    vscode.workspace.onDidSaveTextDocument(() => formatView.refresh()),
  );

  // Auto-save + styled views: half-typed code can't be canonicalized, so timed auto-saves would
  // fail noisily. `files.autoSaveWhenNoErrors` lets our "not saved yet" diagnostic hold them off.
  const suggestAutoSaveSetting = async () => {
    const files = vscode.workspace.getConfiguration('files');
    if (files.get('autoSave') === 'off' || files.get('autoSaveWhenNoErrors') || context.globalState.get('lenses.autoSaveHintShown')) return;
    if (style() === 'canonical') return;
    await context.globalState.update('lenses.autoSaveHintShown', true);
    const pick = await vscode.window.showInformationMessage(
      'Auto-save is on. Turn on "Auto Save When No Errors" so styled views only save once your code parses (otherwise half-typed code fails to save)?', 'Turn On', 'Not Now');
    if (pick === 'Turn On') await files.update('autoSaveWhenNoErrors', true, vscode.ConfigurationTarget.Global);
  };
  void suggestAutoSaveSetting();

  // Status bar: current lens, click to switch.
  const lensStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
  lensStatus.command = 'lenses.selectHighlight';
  const updateLensStatus = () => {
    const s = schemeById(scheme());
    lensStatus.text = `$(eye) ${s && s.id !== 'none' ? s.name : 'No lens'}`;
    lensStatus.tooltip = s && s.id !== 'none' ? `Highlight lens: ${s.question}` : 'Pick a highlight lens';
    if (highlightOn()) lensStatus.show(); else lensStatus.hide();
  };
  updateLensStatus();
  context.subscriptions.push(lensStatus);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration('lenses.highlight')) {
        highlight.refreshAll();
        highlightView.refresh();
        updateLensStatus();
      }
      if (e.affectsConfiguration('lenses.format.customStyles')) {
        loadCustomStyles();
        await formatView.rebuild();
        // The active style's definition may have changed: re-project open views.
        if (styleById(style()).custom || !allStyles().some(s => s.id === style())) await format.applyStyleToOpenEditors();
      }
      if (e.affectsConfiguration('lenses.format.style') || e.affectsConfiguration('lenses.format.enabled')) {
        const dirty = vscode.workspace.textDocuments.filter(d => d.uri.scheme === SCHEME && d.isDirty).length;
        if (dirty) vscode.window.showInformationMessage(`${dirty} unsaved styled file${dirty > 1 ? 's keep their' : ' keeps its'} old layout until saved.`);
        await format.applyStyleToOpenEditors();
        formatView.refresh();
      }
      if (e.affectsConfiguration('lenses.format.autoProject')) formatView.refresh();
      if (e.affectsConfiguration('lenses.editor.showAccounts')) {
        vscode.window.showInformationMessage('The Accounts button changes the next time Lenses starts: close all Lenses windows, then open Lenses again. (Or right-click the activity bar and choose Accounts.)');
      }
      if (e.affectsConfiguration('files.autoSave') || e.affectsConfiguration('lenses.format.style')) void suggestAutoSaveSetting();
    }),

    vscode.commands.registerCommand('lenses.selectHighlight', async () => {
      const pick = await vscode.window.showQuickPick(
        SCHEMES.map(s => ({ label: s.name, description: s.question, detail: s.description, id: s.id, picked: s.id === scheme() })),
        { title: 'Highlight lens', placeHolder: 'What should color tell you?' },
      );
      if (pick) await setHighlight(pick.id);
    }),
    vscode.commands.registerCommand('lenses.selectFormat', async () => {
      const pick = await vscode.window.showQuickPick(
        allStyles().map(s => ({ label: s.name, description: s.custom ? 'custom' : undefined, detail: s.description, id: s.id, picked: s.id === style() })),
        { title: 'Display format', placeHolder: 'How do you want to read code? (Disk keeps the canonical form.)' },
      );
      if (pick) await setFormat(pick.id);
    }),
    vscode.commands.registerCommand('lenses.editCustomStyles', () =>
      vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'lenses.format.customStyles' } })),
    vscode.commands.registerCommand('lenses.createCustomStyle', async () => {
      const name = await vscode.window.showInputBox({ title: 'New display style (1/2)', prompt: 'Name for your style', placeHolder: 'e.g. My laptop style', validateInput: v => {
        if (!v.trim()) return 'Enter a name';
        const id = 'custom:' + v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return allStyles().some(s => s.id === id) ? 'A style with this name already exists' : undefined;
      } });
      if (!name) return;
      const base = await vscode.window.showQuickPick(
        [{ label: "Prettier's defaults", id: '' }, ...allStyles().filter(s => s.id !== 'canonical').map(s => ({ label: s.name, description: s.custom ? 'custom' : undefined, detail: s.description, id: s.id }))],
        { title: 'New display style (2/2)', placeHolder: 'Start from…' },
      );
      if (!base) return;
      const from = base.id ? styleById(base.id) : undefined;
      const entry: CustomStyleConfig = {
        name: name.trim(),
        ...(base.id ? { extends: base.id } : {}),
        // Spell out the common options so they're easy to tweak in settings.json.
        prettier: { printWidth: 80, tabWidth: 2, useTabs: false, semi: true, singleQuote: false, trailingComma: 'all', bracketSpacing: true, arrowParens: 'always', ...from?.prettier },
      };
      const existing = cfg().get<CustomStyleConfig[]>('format.customStyles', []);
      await set('format.customStyles', [...existing, entry]);
      await set('format.style', 'custom:' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      await vscode.commands.executeCommand('lenses.editCustomStyles');
    }),
    vscode.commands.registerCommand('lenses.showDifferences', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@id:${DIFFERENCES.map(d => d.setting).join(',')}`)),
    vscode.commands.registerCommand('lenses.openCanonical', () => format.openCanonical()),
    vscode.commands.registerCommand('lenses.openProjected', () => format.openProjected()),
    vscode.commands.registerCommand('lenses.gotoCanonicalLine', () => format.gotoCanonicalLine()),
    vscode.commands.registerCommand('lenses.setHighlight', (id: string) => setHighlight(id)),
    vscode.commands.registerCommand('lenses.setFormat', (id: string) => setFormat(id)),
  );
}

export function deactivate() {}
