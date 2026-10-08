import * as vscode from 'vscode';
import { SidebarMode } from './types';
import { SidebarDetector } from './sidebarDetector';

// Instant mode switching: each mode owns an editor group, and switching shows that group
// maximized (VS Code hides the other group at zero width). No tab is ever opened or closed,
// so nothing flickers, and each mode keeps its editors' scroll position and undo history.

const FOCUS_COMMANDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']
  .map(n => `workbench.action.focus${n}EditorGroup`);

export const MODE_GROUP: Record<SidebarMode, number> = { explorer: 1, scm: 2 };

/**
 * Commands that leave exactly `mode`'s group maximized, from any layout. The API can't tell
 * which group is maximized and the maximize command is a toggle, but focusing a hidden group
 * always un-maximizes, so "focus other, focus target, toggle" always ends the same way.
 * (Focusing a group that doesn't exist yet creates it.) Run them via `runCommands` so they
 * execute back-to-back in the window, with no frame painted mid-sequence.
 */
export function showGroupCommands(mode: SidebarMode): string[] {
  const target = MODE_GROUP[mode];
  const other = target === 1 ? 2 : 1;
  return [FOCUS_COMMANDS[other - 1], FOCUS_COMMANDS[target - 1], 'workbench.action.toggleMaximizeEditorGroup'];
}

/** Switch sidebar and editor group in one step inside the window (keybindings, status bar). */
export function switchModeCommand(mode: SidebarMode): vscode.Command {
  const view = mode === 'explorer' ? 'workbench.view.explorer' : 'workbench.view.scm';
  return {
    title: mode === 'explorer' ? 'Explorer' : 'Source Control',
    command: 'runCommands',
    arguments: [{ commands: [...showGroupCommands(mode), view] }],
  };
}

export class GroupModeManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private currentMode: SidebarMode;
  private owesSidebarFocus = false;

  constructor(private detector: SidebarDetector, private log: vscode.OutputChannel) {
    this.currentMode = detector.mode;
    this.disposables.push(
      detector.onDidChangeMode(mode => this.switchTo(mode)),
      // Leaving Source Control is reported ("SCM hidden") before the Explorer reports itself
      // shown, so a switch to Explorer runs before we know its sidebar is up. When it does show,
      // hand it the focus the group switch took.
      detector.onDidShowSidebar(mode => {
        if (this.owesSidebarFocus && mode === this.currentMode) {
          this.owesSidebarFocus = false;
          void vscode.commands.executeCommand('workbench.action.focusSideBar');
        }
      }),
    );
  }

  /** Show `mode`'s group. `force` re-establishes the layout even if the mode is unchanged. */
  async switchTo(mode: SidebarMode, force = false): Promise<void> {
    if (mode === this.currentMode && !force) return;
    this.currentMode = mode;
    const commands = showGroupCommands(mode);
    // Focusing the group takes keyboard focus from the sidebar the user just clicked; give it
    // back, but only when that sidebar is showing (so a closed sidebar isn't reopened).
    if (this.detector.sidebarShowing) commands.push('workbench.action.focusSideBar');
    this.owesSidebarFocus = !this.detector.sidebarShowing && !force;
    const t0 = Date.now();
    await vscode.commands.executeCommand('runCommands', { commands });
    this.log.appendLine(`groups: showing ${mode} (group ${MODE_GROUP[mode]}) in ${Date.now() - t0}ms`);
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
