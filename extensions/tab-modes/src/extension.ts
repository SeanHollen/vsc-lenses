import * as vscode from 'vscode';
import { SidebarDetector } from './sidebarDetector';
import { TabManager } from './tabManager';
import { GroupModeManager, switchModeCommand } from './groupManager';
import { SidebarMode } from './types';

const log = vscode.window.createOutputChannel('Tabs Per Mode');

export function activate(context: vscode.ExtensionContext) {
  log.appendLine('Extension activating...');
  const config = () => vscode.workspace.getConfiguration('tabsPerMode');
  let running: Running | undefined;
  const restart = (firstStart: boolean) => {
    const wasGroups = running?.groups ?? false;
    running?.dispose();
    running = undefined;
    if (config().get<boolean>('enabled', true)) running = new Running(context, config().get<string>('strategy', 'groups'));
    // Turned off (or switched to reopen): put the mode groups back into one, like plain VS Code.
    else log.appendLine('Disabled: tabs are no longer split by mode.');
    if (!firstStart && wasGroups && !running?.groups) void vscode.commands.executeCommand('workbench.action.joinAllGroups');
  };
  restart(true);
  context.subscriptions.push(
    log,
    { dispose: () => running?.dispose() },
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('tabsPerMode.enabled') || e.affectsConfiguration('tabsPerMode.strategy')) restart(false);
    }),
    vscode.commands.registerCommand('tabsPerMode.switchToExplorer', () => {
      log.appendLine('Manual command: switch to explorer');
      running?.switchTo('explorer');
    }),
    vscode.commands.registerCommand('tabsPerMode.switchToSourceControl', () => {
      log.appendLine('Manual command: switch to scm');
      running?.switchTo('scm');
    }),
  );

  log.appendLine('Extension activated.');
}

/** Everything Tabs Per Mode does while it's enabled. */
class Running implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  readonly groups: boolean;
  private manager: GroupModeManager | TabManager;

  constructor(context: vscode.ExtensionContext, strategy: string) {
    this.groups = strategy === 'groups';
    const detector = new SidebarDetector(log);
    const manager = this.manager = this.groups ? new GroupModeManager(detector, log) : new TabManager(detector, context.workspaceState, log);
    // Make sure sidebar switches can be detected, then establish the layout for the starting
    // mode (groups may be restored in any state).
    void detector.ensureSectionsExpanded(context.workspaceState).then(() => {
      if (manager instanceof GroupModeManager) return manager.switchTo(detector.mode, true);
    });

    // Status bar buttons
    const explorerBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    explorerBtn.text = '$(file-directory) Explorer';
    // With groups, the buttons switch sidebar + group in one step inside the window (no lag).
    explorerBtn.command = this.groups ? switchModeCommand('explorer') : 'tabsPerMode.focusExplorer';
    explorerBtn.tooltip = 'Switch to Explorer mode tabs';

    const scmBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    scmBtn.text = '$(git-compare) Source Control';
    scmBtn.command = this.groups ? switchModeCommand('scm') : 'tabsPerMode.focusSourceControl';
    scmBtn.tooltip = 'Switch to Source Control mode tabs';

    function updateStatusBar(mode: string) {
      if (mode === 'explorer') {
        explorerBtn.text = '$(file-directory) Explorer *';
        scmBtn.text = '$(git-compare) Source Control';
      } else {
        explorerBtn.text = '$(file-directory) Explorer';
        scmBtn.text = '$(git-compare) Source Control *';
      }
    }
    updateStatusBar(detector.mode);
    explorerBtn.show();
    scmBtn.show();

    this.disposables.push(detector, manager, explorerBtn, scmBtn, detector.onDidChangeMode(mode => updateStatusBar(mode)));
  }

  switchTo(mode: SidebarMode) {
    if (this.manager instanceof TabManager) this.manager.handleModeSwitch(mode); else void this.manager.switchTo(mode);
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

export function deactivate() {}
