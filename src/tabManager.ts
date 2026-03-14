import * as vscode from 'vscode';
import { SidebarMode, ModeState, TabDescriptor } from './types';
import { SidebarDetector } from './sidebarDetector';
import { snapshotTabs, classifyTab, restoreTab, findEquivalentInMode } from './tabSerializer';

export class TabManager implements vscode.Disposable {
  private modeStates = new Map<SidebarMode, ModeState>([
    ['explorer', { tabs: [] }],
    ['scm', { tabs: [] }],
  ]);
  private currentMode: SidebarMode = 'explorer';
  private switching = false;
  private disposables: vscode.Disposable[] = [];

  constructor(
    detector: SidebarDetector,
    private workspaceState: vscode.Memento,
    private log: vscode.OutputChannel,
  ) {
    this.loadPersistedState();

    this.disposables.push(
      detector.onDidChangeMode(mode => this.handleModeSwitch(mode)),
    );
  }

  async handleModeSwitch(newMode: SidebarMode): Promise<void> {
    if (newMode === this.currentMode || this.switching) {
      this.log.appendLine(`Skipping switch (current=${this.currentMode}, new=${newMode}, switching=${this.switching})`);
      return;
    }
    this.switching = true;
    const previousMode = this.currentMode;

    this.log.appendLine(`Switching: ${previousMode} -> ${newMode}`);

    try {
      const config = vscode.workspace.getConfiguration('tabsPerMode');
      const preservePinned = config.get<boolean>('preservePinnedTabs', true);
      const preserveNeutral = config.get<boolean>('preserveNeutralTabs', true);
      const autoNavigate = config.get<boolean>('autoNavigate', true);

      // 1. Snapshot current tabs
      const currentTabs = snapshotTabs();
      const activeTab = currentTabs.find(t => t.isActive);
      this.log.appendLine(`Current tabs: ${currentTabs.map(t => t.label).join(', ')}`);

      // 2. Save current mode state (only tabs belonging to this mode)
      const modeTabs = currentTabs.filter(t => classifyTab(t) === previousMode);
      this.modeStates.set(previousMode, {
        tabs: modeTabs,
        activeTabLabel: activeTab?.label,
      });

      // 3. Determine which tabs to close
      const tabsToClose = currentTabs.filter(descriptor => {
        if (descriptor.isDirty) { return false; }
        if (preservePinned && descriptor.isPinned) { return false; }
        if (preserveNeutral && classifyTab(descriptor) === 'neutral') { return false; }
        return true;
      });
      this.log.appendLine(`Closing ${tabsToClose.length} tabs: ${tabsToClose.map(t => t.label).join(', ')}`);

      // 4. Close tabs
      await this.closeMatchingTabs(tabsToClose);

      // 5. Restore saved tabs for the new mode
      const newModeState = this.modeStates.get(newMode);
      if (newModeState && newModeState.tabs.length > 0) {
        this.log.appendLine(`Restoring ${newModeState.tabs.length} tabs for ${newMode}: ${newModeState.tabs.map(t => t.label).join(', ')}`);
        const existingTabs = snapshotTabs();
        for (const descriptor of newModeState.tabs) {
          if (!this.isTabAlreadyOpen(descriptor, existingTabs)) {
            await restoreTab(descriptor);
          }
        }
      } else {
        this.log.appendLine(`No saved tabs for ${newMode}`);
      }

      // 6. Auto-navigate to equivalent file
      if (autoNavigate && activeTab) {
        const savedTabs = newModeState?.tabs ?? [];
        const equivalent = findEquivalentInMode(activeTab, newMode, savedTabs);
        if (equivalent) {
          this.log.appendLine(`Auto-navigating to equivalent: ${equivalent.label}`);
          await restoreTab({ ...equivalent, isActive: true });
        }
      }

      this.currentMode = newMode;

      // 7. Persist state
      this.persistState();
      this.log.appendLine(`Switch complete: now in ${newMode} mode`);
    } finally {
      this.switching = false;
    }
  }

  private async closeMatchingTabs(descriptors: TabDescriptor[]): Promise<void> {
    const allTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    const toClose = allTabs.filter(tab => {
      return descriptors.some(d => this.tabMatchesDescriptor(tab, d));
    });

    if (toClose.length > 0) {
      await vscode.window.tabGroups.close(toClose);
    }
  }

  private tabMatchesDescriptor(tab: vscode.Tab, descriptor: TabDescriptor): boolean {
    if (descriptor.kind === 'text' && tab.input instanceof vscode.TabInputText) {
      return tab.input.uri.toString() === descriptor.uri;
    }
    if (descriptor.kind === 'diff' && tab.input instanceof vscode.TabInputTextDiff) {
      return (
        tab.input.original.toString() === descriptor.originalUri &&
        tab.input.modified.toString() === descriptor.modifiedUri
      );
    }
    if (descriptor.kind === 'other') {
      return tab.label === descriptor.label;
    }
    return false;
  }

  private isTabAlreadyOpen(descriptor: TabDescriptor, existingTabs: TabDescriptor[]): boolean {
    return existingTabs.some(existing => {
      if (descriptor.kind === 'text' && existing.kind === 'text') {
        return descriptor.uri === existing.uri;
      }
      if (descriptor.kind === 'diff' && existing.kind === 'diff') {
        return (
          descriptor.originalUri === existing.originalUri &&
          descriptor.modifiedUri === existing.modifiedUri
        );
      }
      return false;
    });
  }

  private persistState(): void {
    const data: Record<string, ModeState> = {};
    for (const [mode, state] of this.modeStates) {
      data[mode] = state;
    }
    this.workspaceState.update('tabsPerMode.modeStates', data);
  }

  private loadPersistedState(): void {
    const data = this.workspaceState.get<Record<string, ModeState>>('tabsPerMode.modeStates');
    if (data) {
      for (const mode of ['explorer', 'scm'] as SidebarMode[]) {
        if (data[mode]) {
          this.modeStates.set(mode, data[mode]);
        }
      }
    }
  }

  dispose(): void {
    this.persistState();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
