import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabInputText, TabInputTextDiff, Uri, window, ViewColumn } from 'vscode';
import { snapshotTabs, classifyTab, extractFilePath, findEquivalentInMode, restoreTab } from '../tabSerializer';
import { TabDescriptor } from '../types';

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

function makeDiffTab(path: string, opts: { isActive?: boolean; label?: string } = {}) {
  const modified = Uri.file(path);
  const original = Uri.parse(`git://${path}?ref=HEAD`);
  const fileName = path.split('/').pop()!;
  return {
    label: opts.label ?? `${fileName} (Working Tree)`,
    input: new TabInputTextDiff(original, modified),
    isActive: opts.isActive ?? false,
    isPinned: false,
    isDirty: false,
  };
}

function makeOtherTab(label: string) {
  return {
    label,
    input: { type: 'custom' },
    isActive: false,
    isPinned: false,
    isDirty: false,
  };
}

function textDescriptor(path: string, overrides: Partial<TabDescriptor> = {}): TabDescriptor {
  const uri = Uri.file(path);
  return {
    kind: 'text',
    uri: uri.toString(),
    label: path.split('/').pop()!,
    viewColumn: ViewColumn.One,
    isPinned: false,
    isActive: false,
    isDirty: false,
    ...overrides,
  };
}

function diffDescriptor(path: string, overrides: Partial<TabDescriptor> = {}): TabDescriptor {
  const modified = Uri.file(path);
  const original = Uri.parse(`git://${path}?ref=HEAD`);
  const fileName = path.split('/').pop()!;
  return {
    kind: 'diff',
    originalUri: original.toString(),
    modifiedUri: modified.toString(),
    label: `${fileName} (Working Tree)`,
    viewColumn: ViewColumn.One,
    isPinned: false,
    isActive: false,
    isDirty: false,
    ...overrides,
  };
}

describe('classifyTab', () => {
  it('classifies text tabs as explorer', () => {
    expect(classifyTab(textDescriptor('/foo.ts'))).toBe('explorer');
  });

  it('classifies diff tabs as scm', () => {
    expect(classifyTab(diffDescriptor('/foo.ts'))).toBe('scm');
  });

  it('classifies other tabs as neutral', () => {
    const tab: TabDescriptor = {
      kind: 'other',
      label: 'Settings',
      viewColumn: ViewColumn.One,
      isPinned: false,
      isActive: false,
      isDirty: false,
    };
    expect(classifyTab(tab)).toBe('neutral');
  });
});

describe('extractFilePath', () => {
  it('extracts path from text descriptor', () => {
    const d = textDescriptor('/src/foo.ts');
    expect(extractFilePath(d)).toBe('/src/foo.ts');
  });

  it('extracts path from diff descriptor', () => {
    const d = diffDescriptor('/src/foo.ts');
    expect(extractFilePath(d)).toBe('/src/foo.ts');
  });

  it('returns undefined for other descriptors', () => {
    const d: TabDescriptor = {
      kind: 'other',
      label: 'Settings',
      viewColumn: ViewColumn.One,
      isPinned: false,
      isActive: false,
      isDirty: false,
    };
    expect(extractFilePath(d)).toBeUndefined();
  });
});

describe('findEquivalentInMode', () => {
  it('finds existing saved diff tab when switching to scm', () => {
    const active = textDescriptor('/src/foo.ts', { isActive: true });
    const savedDiff = diffDescriptor('/src/foo.ts');
    const result = findEquivalentInMode(active, 'scm', [savedDiff]);
    expect(result).toEqual(savedDiff);
  });

  it('finds existing saved text tab when switching to explorer', () => {
    const active = diffDescriptor('/src/foo.ts', { isActive: true });
    const savedText = textDescriptor('/src/foo.ts');
    const result = findEquivalentInMode(active, 'explorer', [savedText]);
    expect(result).toEqual(savedText);
  });

  it('constructs a text tab on the fly when no saved explorer tab exists', () => {
    const active = diffDescriptor('/src/foo.ts', { isActive: true });
    const result = findEquivalentInMode(active, 'explorer', []);
    expect(result).toBeDefined();
    expect(result!.kind).toBe('text');
    expect(result!.uri).toContain('/src/foo.ts');
  });

  it('constructs a gitChange tab on the fly when no saved scm tab exists', () => {
    const active = textDescriptor('/src/foo.ts', { isActive: true });
    const result = findEquivalentInMode(active, 'scm', []);
    expect(result).toBeDefined();
    expect(result!.kind).toBe('gitChange');
    expect(result!.uri).toContain('/src/foo.ts');
  });

  it('returns undefined for other tab kinds', () => {
    const active: TabDescriptor = {
      kind: 'other',
      label: 'Settings',
      viewColumn: ViewColumn.One,
      isPinned: false,
      isActive: true,
      isDirty: false,
    };
    const result = findEquivalentInMode(active, 'scm', []);
    expect(result).toBeUndefined();
  });

  it('does not match a saved tab from the wrong mode', () => {
    const active = textDescriptor('/src/foo.ts', { isActive: true });
    const savedText = textDescriptor('/src/foo.ts'); // same mode as active, not target
    const result = findEquivalentInMode(active, 'scm', [savedText]);
    // Should not match savedText (it's explorer, not scm), should construct gitChange
    expect(result).toBeDefined();
    expect(result!.kind).toBe('gitChange');
  });
});

describe('snapshotTabs', () => {
  beforeEach(() => {
    window.tabGroups.all = [];
  });

  it('snapshots text tabs', () => {
    window.tabGroups.all = [
      {
        tabs: [makeTextTab('/src/foo.ts', { isActive: true })],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ];
    const result = snapshotTabs();
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('text');
    expect(result[0].uri).toContain('/src/foo.ts');
    expect(result[0].isActive).toBe(true);
  });

  it('snapshots diff tabs', () => {
    window.tabGroups.all = [
      {
        tabs: [makeDiffTab('/src/bar.ts')],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ];
    const result = snapshotTabs();
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('diff');
    expect(result[0].modifiedUri).toContain('/src/bar.ts');
  });

  it('snapshots other tabs as kind other', () => {
    window.tabGroups.all = [
      {
        tabs: [makeOtherTab('Settings')],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ];
    const result = snapshotTabs();
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('other');
  });

  it('marks only the active tab in the active group as active', () => {
    window.tabGroups.all = [
      {
        tabs: [
          makeTextTab('/a.ts', { isActive: true }),
          makeTextTab('/b.ts', { isActive: false }),
        ],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
      {
        tabs: [makeTextTab('/c.ts', { isActive: true })],
        viewColumn: ViewColumn.Two,
        isActive: false,
      },
    ];
    const result = snapshotTabs();
    expect(result[0].isActive).toBe(true);  // active tab in active group
    expect(result[1].isActive).toBe(false);  // inactive tab
    expect(result[2].isActive).toBe(false);  // active tab but inactive group
  });

  it('captures pinned and dirty flags', () => {
    window.tabGroups.all = [
      {
        tabs: [makeTextTab('/a.ts', { isPinned: true, isDirty: true })],
        viewColumn: ViewColumn.One,
        isActive: true,
      },
    ];
    const result = snapshotTabs();
    expect(result[0].isPinned).toBe(true);
    expect(result[0].isDirty).toBe(true);
  });
});

describe('restoreTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens text tabs via showTextDocument', async () => {
    const d = textDescriptor('/src/foo.ts');
    await restoreTab(d);
    expect((await import('vscode')).workspace.openTextDocument).toHaveBeenCalled();
    expect((await import('vscode')).window.showTextDocument).toHaveBeenCalled();
  });

  it('opens diff tabs via vscode.diff command', async () => {
    const d = diffDescriptor('/src/foo.ts');
    await restoreTab(d);
    const { commands } = await import('vscode');
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.stringContaining('Working Tree'),
      expect.objectContaining({ preview: false }),
    );
  });

  it('opens gitChange tabs via git.openChange command', async () => {
    const d: TabDescriptor = {
      kind: 'gitChange',
      uri: Uri.file('/src/foo.ts').toString(),
      label: 'foo.ts',
      viewColumn: ViewColumn.One,
      isPinned: false,
      isActive: true,
      isDirty: false,
    };
    await restoreTab(d);
    const { commands } = await import('vscode');
    expect(commands.executeCommand).toHaveBeenCalledWith('git.openChange', expect.anything());
  });

  it('silently skips tabs that fail to restore', async () => {
    const { workspace } = await import('vscode');
    (workspace.openTextDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('file not found'));
    const d = textDescriptor('/nonexistent.ts');
    // Should not throw
    await expect(restoreTab(d)).resolves.toBeUndefined();
  });
});
