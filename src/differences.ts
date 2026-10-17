// Every way Lenses differs from plain VS Code, each switchable by a setting. Used by the
// "Show Differences from VS Code" command; keep in sync with the README's table.
export interface Difference {
  setting: string;
  what: string;
  /** The value that gives plain VS Code's behavior. */
  vscode: unknown;
}

export const DIFFERENCES: Difference[] = [
  { setting: 'lenses.highlight.enabled', what: 'Highlight Lenses (activity bar icon, status bar item)', vscode: false },
  { setting: 'lenses.format.enabled', what: 'Format Lenses (activity bar icon, display formats)', vscode: false },
  { setting: 'tabsPerMode.enabled', what: 'Separate tabs for Explorer and Source Control', vscode: false },
  { setting: 'chat.disableAIFeatures', what: 'Copilot chat, agents, inline AI suggestions', vscode: false },
  { setting: 'chat.agentsControl.enabled', what: 'Agents control in the title bar', vscode: 'compact' },
  { setting: 'workbench.secondarySideBar.defaultVisibility', what: 'Right-hand side bar at startup', vscode: 'visibleInWorkspace' },
  { setting: 'lenses.editor.showAccounts', what: 'Accounts button in the activity bar', vscode: true },
  { setting: 'files.autoSave', what: 'Auto-save', vscode: 'off' },
  { setting: 'files.autoSaveWhenNoErrors', what: 'Hold auto-save while the file has errors', vscode: false },
  { setting: 'security.workspace.trust.enabled', what: 'Restricted Mode (workspace trust prompts)', vscode: true },
];
