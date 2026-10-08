import * as vscode from 'vscode';
import { TabDescriptor, SidebarMode } from './types';

export function snapshotTabs(): TabDescriptor[] {
  const descriptors: TabDescriptor[] = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const descriptor: TabDescriptor = {
        kind: 'other',
        label: tab.label,
        viewColumn: group.viewColumn,
        isPinned: tab.isPinned,
        isActive: tab.isActive && group.isActive,
        isDirty: tab.isDirty,
      };

      if (tab.input instanceof vscode.TabInputText) {
        descriptor.kind = 'text';
        descriptor.uri = tab.input.uri.toString();
      } else if (tab.input instanceof vscode.TabInputTextDiff) {
        descriptor.kind = 'diff';
        descriptor.originalUri = tab.input.original.toString();
        descriptor.modifiedUri = tab.input.modified.toString();
      }

      descriptors.push(descriptor);
    }
  }

  return descriptors;
}

export function classifyTab(descriptor: TabDescriptor): SidebarMode | 'neutral' {
  if (descriptor.kind === 'diff') {
    return 'scm';
  }
  if (descriptor.kind === 'text') {
    return 'explorer';
  }
  return 'neutral';
}

export async function restoreTab(descriptor: TabDescriptor, background = false): Promise<void> {
  try {
    if (descriptor.kind === 'text' && descriptor.uri) {
      const uri = vscode.Uri.parse(descriptor.uri);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, {
        viewColumn: descriptor.viewColumn,
        preview: false,
        preserveFocus: background,
      });
    } else if (descriptor.kind === 'diff' && descriptor.originalUri && descriptor.modifiedUri) {
      const original = vscode.Uri.parse(descriptor.originalUri);
      const modified = vscode.Uri.parse(descriptor.modifiedUri);
      await vscode.commands.executeCommand(
        'vscode.diff',
        original,
        modified,
        descriptor.label,
        { viewColumn: descriptor.viewColumn, preview: false, preserveFocus: background }
      );
    } else if (descriptor.kind === 'gitChange' && descriptor.uri) {
      const uri = vscode.Uri.parse(descriptor.uri);
      await vscode.commands.executeCommand('git.openChange', uri);
    }
  } catch {
    // Tab may no longer be valid (file deleted, etc.) — skip silently
  }
}

export function extractFilePath(descriptor: TabDescriptor): string | undefined {
  if (descriptor.kind === 'text' && descriptor.uri) {
    return vscode.Uri.parse(descriptor.uri).fsPath;
  }
  if (descriptor.kind === 'diff' && descriptor.modifiedUri) {
    const uri = vscode.Uri.parse(descriptor.modifiedUri);
    // The modified URI might use git: scheme — extract the path
    return uri.fsPath || uri.path;
  }
  return undefined;
}

export function findEquivalentInMode(
  descriptor: TabDescriptor,
  targetMode: SidebarMode,
  savedTabs: TabDescriptor[]
): TabDescriptor | undefined {
  const filePath = extractFilePath(descriptor);
  if (!filePath) {
    return undefined;
  }

  // First, look for an existing saved tab with the same file path in the target mode
  const existing = savedTabs.find(saved => {
    if (classifyTab(saved) !== targetMode) {
      return false;
    }
    const savedPath = extractFilePath(saved);
    return savedPath === filePath;
  });
  if (existing) {
    return existing;
  }

  // If not found, construct one on the fly
  const fileUri = vscode.Uri.file(filePath);
  if (targetMode === 'explorer') {
    // SCM diff -> plain file
    return {
      kind: 'text',
      uri: fileUri.toString(),
      label: fileUri.path.split('/').pop() || descriptor.label,
      viewColumn: descriptor.viewColumn,
      isPinned: false,
      isActive: true,
      isDirty: false,
    };
  } else {
    // Explorer file -> SCM diff: use a special marker so restoreTab
    // can use the git extension's openChange command
    return {
      kind: 'gitChange',
      uri: fileUri.toString(),
      label: descriptor.label,
      viewColumn: descriptor.viewColumn,
      isPinned: false,
      isActive: true,
      isDirty: false,
    } as TabDescriptor;
  }
}
