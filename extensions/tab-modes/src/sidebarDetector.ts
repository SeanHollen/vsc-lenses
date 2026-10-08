import * as vscode from 'vscode';
import { SidebarMode } from './types';

class EmptyTree implements vscode.TreeDataProvider<never> {
  getTreeItem(): vscode.TreeItem { throw new Error('empty'); }
  getChildren(): never[] { return []; }
}

export class SidebarDetector implements vscode.Disposable {
  private currentMode: SidebarMode = 'explorer';
  private readonly onModeChangeEmitter = new vscode.EventEmitter<SidebarMode>();
  readonly onDidChangeMode = this.onModeChangeEmitter.event;
  private readonly onShownEmitter = new vscode.EventEmitter<SidebarMode>();
  /** The Explorer or Source Control sidebar became visible (fires even if the mode is unchanged). */
  readonly onDidShowSidebar = this.onShownEmitter.event;
  private disposables: vscode.Disposable[] = [];
  private readonly trees = new Map<SidebarMode, vscode.TreeView<never>>();

  constructor(private log: vscode.OutputChannel) {
    const onVisible = (mode: SidebarMode) => this.fireIfChanged(mode);

    // Tree views report visibility without loading a webview, so mode changes arrive sooner.
    for (const mode of ['explorer', 'scm'] as SidebarMode[]) {
      const id = mode === 'explorer' ? 'tabsPerMode.explorerSentinel' : 'tabsPerMode.scmSentinel';
      const tree = vscode.window.createTreeView(id, { treeDataProvider: new EmptyTree() });
      tree.message = 'Tab tracking active';
      this.trees.set(mode, tree);
      if (tree.visible) onVisible(mode);
      this.disposables.push(tree, tree.onDidChangeVisibility(e => {
        log.appendLine(`${mode} sentinel visible=${e.visible}`);
        if (e.visible) { this.onShownEmitter.fire(mode); onVisible(mode); }
        else if (mode === 'scm') {
          // Any non-SCM sidebar (or a closed one) counts as explorer.
          onVisible('explorer');
        }
      }));
    }
    this.disposables.push(this.onModeChangeEmitter, this.onShownEmitter);

    // Fallback commands for manual switching
    this.disposables.push(
      vscode.commands.registerCommand('tabsPerMode.focusExplorer', async () => {
        await vscode.commands.executeCommand('workbench.view.explorer');
        this.fireIfChanged('explorer');
      }),
      vscode.commands.registerCommand('tabsPerMode.focusSourceControl', async () => {
        await vscode.commands.executeCommand('workbench.view.scm');
        this.fireIfChanged('scm');
      }),
    );
  }

  /** Whether the Explorer or Source Control sidebar is currently showing. */
  get sidebarShowing(): boolean {
    return [...this.trees.values()].some(t => t.visible);
  }

  get mode(): SidebarMode {
    return this.currentMode;
  }

  private fireIfChanged(newMode: SidebarMode): void {
    if (newMode !== this.currentMode) {
      this.log.appendLine(`Mode change: ${this.currentMode} -> ${newMode}`);
      this.currentMode = newMode;
      this.onModeChangeEmitter.fire(newMode);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
