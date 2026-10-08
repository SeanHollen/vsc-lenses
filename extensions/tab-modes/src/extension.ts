import * as vscode from 'vscode';
import { SidebarDetector } from './sidebarDetector';
import { TabManager } from './tabManager';
import { GroupModeManager, switchModeCommand } from './groupManager';

const log = vscode.window.createOutputChannel('Tabs Per Mode');

export function activate(context: vscode.ExtensionContext) {
  log.appendLine('Extension activating...');

  const detector = new SidebarDetector(log);
  const strategy = vscode.workspace.getConfiguration('tabsPerMode').get<string>('strategy', 'groups');
  const manager = strategy === 'groups' ? new GroupModeManager(detector, log) : new TabManager(detector, context.workspaceState, log);
  // Establish the layout for the starting mode (groups may be restored in any state).
  if (manager instanceof GroupModeManager) void manager.switchTo(detector.mode, true);

  // Status bar buttons
  const explorerBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  explorerBtn.text = '$(file-directory) Explorer';
  // With groups, the buttons switch sidebar + group in one step inside the window (no lag).
  explorerBtn.command = strategy === 'groups' ? switchModeCommand('explorer') : 'tabsPerMode.focusExplorer';
  explorerBtn.tooltip = 'Switch to Explorer mode tabs';

  const scmBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  scmBtn.text = '$(git-compare) Source Control';
  scmBtn.command = strategy === 'groups' ? switchModeCommand('scm') : 'tabsPerMode.focusSourceControl';
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
  updateStatusBar('explorer');
  explorerBtn.show();
  scmBtn.show();

  detector.onDidChangeMode(mode => updateStatusBar(mode));

  context.subscriptions.push(
    log,
    detector,
    manager,
    explorerBtn,
    scmBtn,
    vscode.commands.registerCommand('tabsPerMode.switchToExplorer', () => {
      log.appendLine('Manual command: switch to explorer');
      if (manager instanceof TabManager) manager.handleModeSwitch('explorer'); else manager.switchTo('explorer');
    }),
    vscode.commands.registerCommand('tabsPerMode.switchToSourceControl', () => {
      log.appendLine('Manual command: switch to scm');
      if (manager instanceof TabManager) manager.handleModeSwitch('scm'); else manager.switchTo('scm');
    }),
  );

  log.appendLine('Extension activated.');
}

export function deactivate() {}
