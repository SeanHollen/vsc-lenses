import * as vscode from 'vscode';
import { analyze } from '../highlight/analyze';
import { SCHEMES } from '../highlight/schemes';
import { esc, renderAnalysis, renderSyntax } from './render';
import { page } from './common';

export interface HighlightState {
  scheme: string;
  mute: boolean;
  legend: { style: string; label: string }[];
  file?: string;
}

export class HighlightView implements vscode.WebviewViewProvider {
  static readonly id = 'lenses.highlightView';
  private view?: vscode.WebviewView;

  constructor(private readonly state: () => HighlightState, private readonly onSelect: (id: string) => void, private readonly onMute: (v: boolean) => void) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage(m => {
      if (m.type === 'select') this.onSelect(m.id);
      if (m.type === 'mute') this.onMute(!!m.value);
      if (m.type === 'ready') this.refresh();
    });
    view.onDidChangeVisibility(() => view.visible && this.refresh());
  }

  refresh() {
    this.view?.webview.postMessage({ type: 'state', ...this.state() });
  }

  private html(): string {
    const cards = SCHEMES.map(s => {
      const ex = s.id === 'none'
        ? renderSyntax(s.example)
        : renderAnalysis(s.example, analyze(s.id, { fileName: `/__lens_example__/${s.id}.ts`, text: s.example, changedLines: new Set(s.exampleChanged) }));
      return `<div class="card" tabindex="0" role="radio" data-id="${s.id}">
        <div class="title">${esc(s.name)}<span class="check">●</span></div>
        <div class="q">${esc(s.question)}</div>
        <div class="desc">${esc(s.description)}</div>
        <pre class="ex">${ex}</pre>
      </div>`;
    }).join('');
    const body = `
      <p class="lede">Ordinary highlighting colors <em>grammar</em>, which you can already see. A lens spends color on one question about the code instead.</p>
      <label class="opt"><input type="checkbox" id="mute"> Mute ordinary syntax colors while a lens is on</label>
      <h2>In this file</h2>
      <div class="file" id="file"></div>
      <h2>Lenses</h2>
      <div role="radiogroup">${cards}</div>`;
    const script = `
      const cards = [...document.querySelectorAll('.card')];
      for (const c of cards) {
        c.addEventListener('click', () => vscode.postMessage({ type: 'select', id: c.dataset.id }));
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
      }
      const mute = document.getElementById('mute');
      mute.addEventListener('change', () => vscode.postMessage({ type: 'mute', value: mute.checked }));
      const esc = s => s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
      window.addEventListener('message', ({ data }) => {
        if (data.type !== 'state') return;
        for (const c of cards) { c.classList.toggle('selected', c.dataset.id === data.scheme); c.setAttribute('aria-checked', c.dataset.id === data.scheme); }
        mute.checked = data.mute;
        const name = cards.find(c => c.dataset.id === data.scheme)?.querySelector('.title').firstChild.textContent ?? '';
        const file = document.getElementById('file');
        if (!data.file) file.innerHTML = '<span class="muted">Open a JavaScript or TypeScript file.</span>';
        else if (data.scheme === 'none') file.innerHTML = '<code>' + esc(data.file) + '</code><br><span class="muted">No lens. Pick one below.</span>';
        else file.innerHTML = '<code>' + esc(data.file) + '</code> · <b>' + esc(name) + '</b>' +
          (data.legend.length ? '<div class="legend">' + data.legend.map(l => '<span class="item"><span class="sw s-' + l.style + '">■ ' + esc(l.label) + '</span></span>').join('') + '</div>'
            : '<br><span class="muted">' + (data.scheme === 'imports' ? 'No imports in this file.' : 'Nothing to show.') + '</span>');
      });
      vscode.postMessage({ type: 'ready' });`;
    return page(this.view!.webview, body, script);
  }
}
