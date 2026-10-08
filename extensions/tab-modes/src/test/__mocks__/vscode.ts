import { vi } from 'vitest';

export class Uri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;
  fsPath: string;

  private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
    this.fsPath = path;
  }

  toString(): string {
    if (this.scheme === 'file') {
      return `file://${this.path}`;
    }
    const q = this.query ? `?${this.query}` : '';
    return `${this.scheme}://${this.path}${q}`;
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  static parse(value: string): Uri {
    const schemeEnd = value.indexOf('://');
    if (schemeEnd === -1) {
      return new Uri('file', '', value, '', '');
    }
    const scheme = value.substring(0, schemeEnd);
    const rest = value.substring(schemeEnd + 3);
    const queryStart = rest.indexOf('?');
    if (queryStart === -1) {
      return new Uri(scheme, '', rest, '', '');
    }
    return new Uri(scheme, '', rest.substring(0, queryStart), rest.substring(queryStart + 1), '');
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }
}

export class TabInputText {
  constructor(public readonly uri: Uri) {}
}

export class TabInputTextDiff {
  constructor(public readonly original: Uri, public readonly modified: Uri) {}
}

export class TreeItem {
  constructor(public label: string) {}
}

export class EventEmitter {
  private listeners: Function[] = [];
  event = (listener: Function) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: unknown) {
    this.listeners.forEach(l => l(data));
  }
  dispose() {
    this.listeners = [];
  }
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export const window = {
  tabGroups: {
    all: [] as { tabs: unknown[]; viewColumn: ViewColumn; isActive: boolean }[],
    close: vi.fn().mockResolvedValue(true),
  },
  showTextDocument: vi.fn().mockResolvedValue(undefined),
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    dispose: vi.fn(),
  })),
  createTreeView: vi.fn(() => ({
    onDidChangeVisibility: vi.fn(),
    dispose: vi.fn(),
  })),
  registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
  createStatusBarItem: vi.fn(() => ({
    text: '',
    command: '',
    tooltip: '',
    show: vi.fn(),
    dispose: vi.fn(),
  })),
};

export const workspace = {
  openTextDocument: vi.fn().mockResolvedValue({}),
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
  })),
};

export const commands = {
  executeCommand: vi.fn().mockResolvedValue(undefined),
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}
