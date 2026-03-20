import * as vscode from 'vscode';
import { SidebarMode } from './types';

class SentinelViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private mode: SidebarMode,
    private onVisible: (mode: SidebarMode) => void,
    private log: vscode.OutputChannel,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.log.appendLine(`${this.mode} webview resolved, visible=${webviewView.visible}`);

    if (webviewView.visible) {
      this.onVisible(this.mode);
    }

    webviewView.onDidChangeVisibility(() => {
      this.log.appendLine(`${this.mode} webview visibility changed: ${webviewView.visible}`);
      if (webviewView.visible) {
        this.onVisible(this.mode);
      } else if (this.mode === 'scm') {
        // SCM became invisible — user switched to a non-SCM sidebar (Explorer, Search, etc.)
        // Treat all non-SCM sidebars as explorer mode
        this.onVisible('explorer');
      }
    });

    webviewView.webview.html = '<html><body style="padding:4px;font-size:11px;color:#888;">Tab tracking active</body></html>';
  }
}

export class SidebarDetector implements vscode.Disposable {
  private currentMode: SidebarMode = 'explorer';
  private readonly onModeChangeEmitter = new vscode.EventEmitter<SidebarMode>();
  readonly onDidChangeMode = this.onModeChangeEmitter.event;
  private disposables: vscode.Disposable[] = [];

  constructor(private log: vscode.OutputChannel) {
    const onVisible = (mode: SidebarMode) => this.fireIfChanged(mode);

    const explorerProvider = new SentinelViewProvider('explorer', onVisible, log);
    const scmProvider = new SentinelViewProvider('scm', onVisible, log);

    this.disposables.push(
      vscode.window.registerWebviewViewProvider('tabsPerMode.explorerSentinel', explorerProvider),
      vscode.window.registerWebviewViewProvider('tabsPerMode.scmSentinel', scmProvider),
      this.onModeChangeEmitter,
    );

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
