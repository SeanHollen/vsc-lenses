import * as vscode from 'vscode';
import { allStyles } from '../format/styles';
import * as prettier from 'prettier';
import { toDisplay } from '../format/project';
import { buildLineMap } from '../format/lineMap';
import { esc, renderSyntax } from './render';
import { page } from './common';

export interface FormatState {
  style: string;
  autoProject: boolean;
  file?: string;
  /** Status of the active file's stored form. */
  canonical?: 'yes' | 'no' | 'error';
  canonicalSource?: string;
  lines?: { canonical: number; display: number };
  /** The selected style failed (e.g. an invalid Prettier option in a custom style). */
  styleError?: string;
}

// Examples are laid out at half the real print widths so they're legible in a sidebar.
const EXAMPLE_SCALE = 0.5;
const EXAMPLE_SOURCE = `function greet(user, loud) {
  const name = user.nick ?? user.first;
  if (loud) { return name.toUpperCase(); } else { return name; }
}
send(user.email, greet(user), { retry: 3 });
`;

async function renderExample(styleId: string, canonical: string): Promise<string> {
  const file = '/__lens_example__/greet.js';
  const display = await toDisplay(canonical, file, styleId, EXAMPLE_SCALE);
  const map = buildLineMap(file, canonical, display);
  const html = renderSyntax(display.replace(/\n$/, ''), file);
  const rows = html.split('</div>').filter(Boolean).map((row, i) => {
    const cont = map.continuation[i];
    const label = cont ? '┆' : map.labels[i] ?? '';
    return `<div class="row"><span class="gut${cont ? ' cont' : ''}">${esc(label)}</span><span>${row.replace(/^<div class="[^"]*">/, '')}</span></div>`;
  });
  return rows.join('');
}

export class FormatView implements vscode.WebviewViewProvider {
  static readonly id = 'lenses.formatView';
  private view?: vscode.WebviewView;

  constructor(private readonly state: () => Promise<FormatState>, private readonly onSelect: (id: string) => void, private readonly onAuto: (v: boolean) => void, private readonly onCommand: (cmd: string) => void) {}

  async resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage(m => {
      if (m.type === 'select') this.onSelect(m.id);
      if (m.type === 'auto') this.onAuto(!!m.value);
      if (m.type === 'command') this.onCommand(m.command);
      if (m.type === 'ready') this.refresh();
    });
    view.onDidChangeVisibility(() => view.visible && this.refresh());
    view.webview.html = await this.html();
  }

  /** Re-render everything (the list of styles changed). */
  async rebuild() {
    if (this.view) this.view.webview.html = await this.html();
  }

  async refresh() {
    if (this.view) this.view.webview.postMessage({ type: 'state', ...(await this.state()) });
  }

  private async html(): Promise<string> {
    const canonical = await prettier.format(EXAMPLE_SOURCE, { parser: 'babel', printWidth: 80 * EXAMPLE_SCALE });
    const cards = await Promise.all(allStyles().map(async s => {
      let example: string;
      try {
        example = `<pre class="ex fit">${await renderExample(s.id, canonical)}</pre>`;
      } catch (e) {
        // Usually a bad Prettier option in a custom style; say which, instead of a blank card.
        example = `<div class="err">⚠ ${esc(String((e as Error).message ?? e).split('\n')[0])}</div>`;
      }
      return `
      <div class="card" tabindex="0" role="radio" data-id="${esc(s.id)}">
        <div class="title">${esc(s.name)}${s.custom ? '<span class="tag">custom</span>' : ''}<span class="check">●</span></div>
        <div class="desc">${esc(s.description)}</div>
        ${example}
      </div>`;
    }));
    const body = `
      <p class="lede">Files are stored in one <b>canonical</b> format. Choose how <em>you</em> want to read and edit them: saving converts back to canonical, so diffs and teammates never see your style.</p>
      <p class="lede">The gutter shows <b>canonical</b> line numbers. <span class="muted">┆</span> marks a display line that continues the canonical line above, and <code>4-6</code> means several canonical lines were joined.</p>
      <label class="opt"><input type="checkbox" id="auto"> Open JS/TS files in this style automatically</label>
      <h2>In this file</h2>
      <div class="file" id="file"></div>
      <h2>Display styles <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:normal">· examples at ½ width</span></h2>
      <div role="radiogroup">${cards.join('')}</div>
      <div class="actions">
        <button data-cmd="lenses.createCustomStyle">＋ Create custom style…</button>
        <button data-cmd="lenses.editCustomStyles">Edit custom styles</button>
      </div>
      <p class="muted small">Custom styles are Prettier options (<code>printWidth</code>, <code>semi</code>, <code>singleQuote</code>, <code>trailingComma</code>, <code>objectWrap</code>…) in the <code>lenses.format.customStyles</code> setting. A style can also extend another one, load a <code>.prettierrc</code> you already have, or use Allman braces.</p>`;
    const script = `
      const cards = [...document.querySelectorAll('.card')];
      for (const c of cards) {
        c.addEventListener('click', () => vscode.postMessage({ type: 'select', id: c.dataset.id }));
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
      }
      const auto = document.getElementById('auto');
      auto.addEventListener('change', () => vscode.postMessage({ type: 'auto', value: auto.checked }));
      const esc = s => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
      document.querySelector('.actions').addEventListener('click', e => {
        const b = e.target.closest('button'); if (b) vscode.postMessage({ type: 'command', command: b.dataset.cmd });
      });
      document.getElementById('file').addEventListener('click', e => {
        const b = e.target.closest('button'); if (b) vscode.postMessage({ type: 'command', command: b.dataset.cmd });
      });
      window.addEventListener('message', ({ data }) => {
        if (data.type !== 'state') return;
        for (const c of cards) { c.classList.toggle('selected', c.dataset.id === data.style); c.setAttribute('aria-checked', c.dataset.id === data.style); }
        auto.checked = data.autoProject;
        const f = document.getElementById('file');
        if (!data.file) { f.innerHTML = '<span class="muted">Open a JavaScript or TypeScript file.</span>'; return; }
        let h = '<code>' + esc(data.file) + '</code><br>';
        h += data.canonical === 'yes' ? '<span class="ok">✓</span> Stored in canonical form'
          : data.canonical === 'no' ? '<span class="warn">⚠</span> Not in canonical form yet. The first save from a styled view will reformat it'
          : '<span class="warn">⚠</span> Has a syntax error, so it is shown verbatim';
        if (data.styleError) h += '<br><span class="warn">⚠</span> This style failed, so the file is shown as stored: ' + esc(data.styleError);
        h += '<br><span class="muted">Canonical = Prettier with ' + esc(data.canonicalSource || 'defaults') + '</span>';
        if (data.lines) h += '<br>' + data.lines.canonical + ' canonical lines → ' + data.lines.display + ' display lines';
        h += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
          (data.style !== 'canonical' ? '<button data-cmd="lenses.openProjected">View in this style</button><button data-cmd="lenses.openCanonical">View raw file</button>' : '') +
          '<button data-cmd="lenses.gotoCanonicalLine">Go to canonical line…</button></div>';
        f.innerHTML = h;
      });
      // Layout is the point of these examples, so shrink them to fit instead of wrapping.
      const fit = () => document.querySelectorAll('pre.fit').forEach(p => {
        p.style.fontSize = '';
        const base = parseFloat(getComputedStyle(p).fontSize);
        const ratio = p.clientWidth / p.scrollWidth;
        if (ratio < 1) p.style.fontSize = Math.max(6.5, base * ratio * 0.98) + 'px';
      });
      new ResizeObserver(fit).observe(document.body);
      fit();
      vscode.postMessage({ type: 'ready' });`;
    return page(this.view!.webview, body, script);
  }
}
