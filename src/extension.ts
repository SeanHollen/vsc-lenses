import * as vscode from 'vscode';
import { SidebarDetector } from './sidebarDetector';
import { TabManager } from './tabManager';

const log = vscode.window.createOutputChannel('Tabs Per Mode');

export function activate(context: vscode.ExtensionContext) {
  log.appendLine('Extension activating...');

  const detector = new SidebarDetector(log);
  const manager = new TabManager(detector, context.workspaceState, log);

  // Status bar buttons
  const explorerBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  explorerBtn.text = '$(file-directory) Explorer';
  explorerBtn.command = 'tabsPerMode.focusExplorer';
  explorerBtn.tooltip = 'Switch to Explorer mode tabs';

  const scmBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  scmBtn.text = '$(git-compare) Source Control';
  scmBtn.command = 'tabsPerMode.focusSourceControl';
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
      manager.handleModeSwitch('explorer');
    }),
    vscode.commands.registerCommand('tabsPerMode.switchToSourceControl', () => {
      log.appendLine('Manual command: switch to scm');
      manager.handleModeSwitch('scm');
    }),
  );

  log.appendLine('Extension activated.');
}

export function deactivate() {}
