import * as vscode from 'vscode';
import { stylesCss } from '../styles';

export const BASE_CSS = `
  body { padding: 0 12px 16px; font-size: 13px; color: var(--vscode-foreground); }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--vscode-descriptionForeground); margin: 18px 0 8px; font-weight: 600; }
  p.lede { color: var(--vscode-descriptionForeground); margin: 10px 0 4px; line-height: 1.45; }
  .card { border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.25)); border-radius: 6px; padding: 9px 10px 10px; margin: 8px 0; cursor: pointer; background: var(--vscode-sideBar-background); }
  .card:hover { border-color: var(--vscode-focusBorder); }
  .card:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
  .card.selected { border-color: var(--vscode-focusBorder); box-shadow: inset 3px 0 0 var(--vscode-focusBorder); }
  .card .title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .card .title .check { margin-left: auto; color: var(--vscode-focusBorder); visibility: hidden; }
  .card.selected .title .check { visibility: visible; }
  .card .q { font-style: italic; color: var(--vscode-textLink-foreground); margin: 2px 0 4px; }
  .card .desc { color: var(--vscode-descriptionForeground); line-height: 1.4; margin-bottom: 7px; }
  pre.ex { margin: 0; padding: 6px 0; border-radius: 4px; background: var(--vscode-editor-background); font-family: var(--vscode-editor-font-family); font-size: 11.5px; line-height: 1.5; overflow-x: hidden; }
  pre.ex .ln { padding: 0 8px 0 calc(8px + 2ch); text-indent: -2ch; white-space: pre-wrap; word-break: break-word; min-height: 1.5em; }
  pre.ex .row { display: flex; white-space: pre-wrap; word-break: break-word; }
  pre.ex .row > span:last-child { padding-left: 2ch; text-indent: -2ch; }
  pre.ex.fit, pre.ex.fit .row { white-space: pre; word-break: normal; }
  pre.ex.fit .row > span:last-child { padding-left: 0; text-indent: 0; padding-right: 8px; }
  pre.ex .gut { flex: none; width: 4.2ch; text-align: right; padding-right: 1.2ch; color: var(--vscode-editorLineNumber-foreground); user-select: none; }
  pre.ex .gut.cont { color: var(--vscode-editorIndentGuide-activeBackground1, var(--vscode-editorLineNumber-foreground)); opacity: .7; }
  .card .tag { font-size: 10px; font-weight: normal; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .card .err { color: var(--vscode-errorForeground); font-size: 12px; padding: 4px 0; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 6px; }
  .small { font-size: 11.5px; line-height: 1.45; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 7px; font-size: 11.5px; }
  .legend span.sw { font-family: var(--vscode-editor-font-family); }
  .legend .item { display: inline-flex; gap: 5px; align-items: baseline; }
  label.opt { display: flex; gap: 6px; align-items: center; margin: 6px 0; cursor: pointer; }
  .file { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); padding: 7px 9px; border-radius: 3px; line-height: 1.45; }
  .file code { font-family: var(--vscode-editor-font-family); }
  .muted { color: var(--vscode-descriptionForeground); }
  .warn { color: var(--vscode-editorWarning-foreground); }
  .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .syn-kw { color: var(--vscode-debugTokenExpression-name, #569cd6); }
  body.vscode-dark .syn-kw { color: #569cd6; } body.vscode-light .syn-kw { color: #0000ff; }
  body.vscode-dark .syn-str { color: #ce9178; } body.vscode-light .syn-str { color: #a31515; }
  body.vscode-dark .syn-num { color: #b5cea8; } body.vscode-light .syn-num { color: #098658; }
  body.vscode-dark .syn-fn { color: #dcdcaa; } body.vscode-light .syn-fn { color: #795e26; }
  .syn-com { color: var(--vscode-descriptionForeground); font-style: italic; }
  ${stylesCss()}
`;

export function page(webview: vscode.Webview, body: string, script: string): string {
  const nonce = Math.random().toString(36).slice(2);
  return `<!doctype html><html><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>${BASE_CSS}</style></head><body>${body}
  <script nonce="${nonce}">const vscode = acquireVsCodeApi();${script}</script></body></html>`;
}
