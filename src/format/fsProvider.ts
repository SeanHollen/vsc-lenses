import * as vscode from 'vscode';
import { toCanonical, toDisplay } from './project';

// `lens-fmt:/abs/path/file.ts` is a view of `file:///abs/path/file.ts` in the current display
// style. Reads project the canonical file into that style; writes convert back to canonical
// form before touching disk. The disk file is the only source of truth.

export const SCHEME = 'lens-fmt';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const toLensUri = (file: vscode.Uri) => file.with({ scheme: SCHEME });
export const toFileUri = (lens: vscode.Uri) => lens.with({ scheme: 'file' });

export class ProjectionFS implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  /** Per-file counter bumped on style changes so stat() reports a newer mtime and the editor
   *  reloads. Dirty documents are skipped: they keep their layout until saved, rather than
   *  hitting a "file is newer on disk" conflict. */
  private readonly generation = new Map<string, number>();
  private readonly cache = new Map<string, { key: string; display: string }>();
  /** Last projection failure per file: a syntax error in the file, or a bad style option. */
  readonly errors = new Map<string, { kind: 'syntax' | 'style'; message: string }>();

  constructor(private style: () => string) {}

  styleChanged() {
    this.cache.clear();
    const events: vscode.FileChangeEvent[] = [];
    for (const d of vscode.workspace.textDocuments) {
      if (d.uri.scheme !== SCHEME || d.isDirty) continue;
      const k = toFileUri(d.uri).fsPath;
      this.generation.set(k, (this.generation.get(k) ?? 0) + 1);
      events.push({ type: vscode.FileChangeType.Changed, uri: d.uri });
    }
    if (events.length) this.emitter.fire(events);
  }

  /** Force an open document to re-read its projection (bumps its mtime). */
  reproject(uri: vscode.Uri) {
    const k = toFileUri(uri).fsPath;
    this.generation.set(k, (this.generation.get(k) ?? 0) + 1);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  /** Disk changed under us (external edit, git checkout, save from a plain editor). */
  fileChanged(file: vscode.Uri) {
    this.cache.delete(file.fsPath);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri: toLensUri(file) }]);
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const s = await vscode.workspace.fs.stat(toFileUri(uri));
    const display = s.type === vscode.FileType.File ? await this.display(uri) : undefined;
    return { ...s, mtime: s.mtime + (this.generation.get(toFileUri(uri).fsPath) ?? 0), size: display ? enc.encode(display).length : s.size };
  }

  readDirectory(uri: vscode.Uri) {
    return vscode.workspace.fs.readDirectory(toFileUri(uri));
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    return enc.encode(await this.display(uri));
  }

  async canonical(uri: vscode.Uri): Promise<string> {
    return dec.decode(await vscode.workspace.fs.readFile(toFileUri(uri)));
  }

  async display(uri: vscode.Uri): Promise<string> {
    const file = toFileUri(uri);
    const canonical = await this.canonical(uri);
    const key = `${this.style()}\0${canonical}`;
    const hit = this.cache.get(file.fsPath);
    if (hit?.key === key) return hit.display;
    let display: string;
    try {
      display = await toDisplay(canonical, file.fsPath, this.style());
      this.errors.delete(file.fsPath);
    } catch (e) {
      // Show the file verbatim rather than refusing to open it, and record why.
      display = canonical;
      const kind = (await toCanonical(canonical, file.fsPath).then(() => true, () => false)) ? 'style' : 'syntax';
      this.errors.set(file.fsPath, { kind, message: String((e as Error).message ?? e).split('\n')[0] });
    }
    this.cache.set(file.fsPath, { key, display });
    return display;
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const file = toFileUri(uri);
    const display = dec.decode(content);
    let canonical: string;
    const previous = await this.canonical(uri).catch(() => undefined);
    try {
      canonical = await toCanonical(display, file.fsPath, previous);
    } catch (e) {
      const msg = String((e as Error).message ?? e).split('\n')[0];
      throw vscode.FileSystemError.NoPermissions(`Can't convert to canonical form (fix the syntax error first): ${msg}`);
    }
    await vscode.workspace.fs.writeFile(file, enc.encode(canonical));
    this.cache.delete(file.fsPath);
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('lens-fmt views are read/write per file only');
  }
  delete(): void {
    throw vscode.FileSystemError.NoPermissions('Delete the file from the Explorer instead');
  }
  rename(): void {
    throw vscode.FileSystemError.NoPermissions('Rename the file from the Explorer instead');
  }
}
