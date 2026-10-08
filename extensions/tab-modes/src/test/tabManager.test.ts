import { describe, it, expect, beforeEach, vi } from 'vitest';
import { window, ViewColumn, TabInputText, TabInputTextDiff, Uri } from 'vscode';
import { TabManager } from '../tabManager';
import { SidebarDetector } from '../sidebarDetector';
import { EventEmitter } from 'vscode';

// Minimal mock for SidebarDetector
function createMockDetector() {
  const emitter = new EventEmitter();
  return {
    mode: 'explorer' as 'explorer' | 'scm',
    onDidChangeMode: emitter.event,
    fire: (mode: 'explorer' | 'scm') => emitter.fire(mode),
    dispose: () => {},
  };
}

function createMockMemento(): { get: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } {
  const store: Record<string, unknown> = {};
  return {
    get: vi.fn((key: string) => store[key]),
    update: vi.fn((key: string, value: unknown) => { store[key] = value; return Promise.resolve(); }),
  };
}

function makeTextTab(path: string, opts: { isActive?: boolean; isPinned?: boolean; isDirty?: boolean } = {}) {
  const uri = Uri.file(path);
  return {
    label: path.split('/').pop()!,
    input: new TabInputText(uri),
    isActive: opts.isActive ?? false,
    isPinned: opts.isPinned ?? false,
    isDirty: opts.isDirty ?? false,
  };
}

function makeDiffTab(path: string, opts: { isActive?: boolean } = {}) {
  const modified = Uri.file(path);
  const original = Uri.parse(`git://${path}?ref=HEAD`);
  const fileName = path.split('/').pop()!;
  return {
    label: `${fileName} (Working Tree)`,
    input: new TabInputTextDiff(original, modified),
    isActive: opts.isActive ?? false,
    isPinned: false,
    isDirty: false,
  };
}

const log = { appendLine: vi.fn(), dispose: vi.fn() } as any;

describe('TabManager', () => {
  let detector: ReturnType<typeof createMockDetector>;
  let memento: ReturnType<typeof createMockMemento>;
  let manager: TabManager;

  beforeEach(() => {
    vi.clearAllMocks();
    window.tabGroups.all = [];
    (window.tabGroups.close as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    detector = createMockDetector();
    memento = createMockMemento();
    manager = new TabManager(detector as any, memento as any, log);
  });

  it('closes explorer tabs when switching to scm', async () => {
    window.tabGroups.all = [
      {
        tabs: [
          makeTextTab('/foo.ts', { isActive: true }),
          makeTextTab('/bar.ts'),
        ],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    await manager.handleModeSwitch('scm');

    expect(window.tabGroups.close).toHaveBeenCalled();
    const closedTabs = (window.tabGroups.close as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(closedTabs).toHaveLength(2);
  });

  it('does not close dirty tabs', async () => {
    window.tabGroups.all = [
      {
        tabs: [
          makeTextTab('/clean.ts'),
          makeTextTab('/dirty.ts', { isDirty: true }),
        ],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    await manager.handleModeSwitch('scm');

    const closedTabs = (window.tabGroups.close as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(closedTabs).toHaveLength(1);
    expect(closedTabs[0].label).toBe('clean.ts');
  });

  it('does not close pinned tabs when preservePinnedTabs is true', async () => {
    window.tabGroups.all = [
      {
        tabs: [
          makeTextTab('/normal.ts'),
          makeTextTab('/pinned.ts', { isPinned: true }),
        ],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    await manager.handleModeSwitch('scm');

    const closedTabs = (window.tabGroups.close as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(closedTabs).toHaveLength(1);
    expect(closedTabs[0].label).toBe('normal.ts');
  });

  it('does not switch when already in the target mode', async () => {
    await manager.handleModeSwitch('explorer');
    expect(window.tabGroups.close).not.toHaveBeenCalled();
  });

  it('saves only mode-relevant tabs', async () => {
    // Have both text and diff tabs open, switch from explorer to scm
    window.tabGroups.all = [
      {
        tabs: [
          makeTextTab('/foo.ts', { isActive: true }),
          makeDiffTab('/bar.ts'),
        ],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    await manager.handleModeSwitch('scm');

    // The saved explorer state should only contain the text tab
    expect(memento.update).toHaveBeenCalled();
    const savedData = memento.update.mock.calls[0][1];
    expect(savedData.explorer.tabs).toHaveLength(1);
    expect(savedData.explorer.tabs[0].kind).toBe('text');
  });

  it('restores previously saved tabs when switching back', async () => {
    // Start with text tabs, switch to scm
    window.tabGroups.all = [
      {
        tabs: [makeTextTab('/foo.ts', { isActive: true })],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    await manager.handleModeSwitch('scm');

    // Now simulate being in scm with a diff tab, switch back to explorer
    window.tabGroups.all = [
      {
        tabs: [makeDiffTab('/bar.ts', { isActive: true })],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ] as any;

    const { workspace } = await import('vscode');
    (workspace.openTextDocument as ReturnType<typeof vi.fn>).mockClear();

    await manager.handleModeSwitch('explorer');

    // Should have tried to restore foo.ts
    expect(workspace.openTextDocument).toHaveBeenCalled();
  });
});
