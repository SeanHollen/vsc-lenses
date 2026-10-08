// Record what the workbench shows on every animation frame while an action runs: which
// sidebar is visible and which editor tabs exist. Prints only frames where something changed.
// Usage: node tools/trace-frames.mjs <port> <css-selector-to-click | key:ctrl+shift+g> [ms=1500]
const [port, selector, ms = 1500] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page' && /workbench/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0;
const send = (method, params = {}) => new Promise(res => {
  const i = ++id;
  ws.addEventListener('message', function on(e) { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener('message', on); res(m.result); } });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await evaluate(`(() => {
  window.__frames = [];
  const snap = () => {
    const side = document.querySelector('.part.sidebar .composite.title h2, .part.sidebar .title-label h2')?.textContent ?? '';
    // Only groups that are actually on screen (a hidden/maximized-away group has width 0).
    const groups = [...document.querySelectorAll('.editor-group-container')].filter(g => g.getBoundingClientRect().width > 1);
    const tabs = groups.flatMap((g, i) => [...g.querySelectorAll('.tabs-container .tab')].map(t => (groups.length > 1 ? 'g' + i + ':' : '') + t.getAttribute('aria-label').replace(/, preview$/, '').replace(/, Editor Group \\d+$/, '') + (t.classList.contains('active') ? '*' : '')));
    const editor = groups.map(g => g.querySelector('.monaco-editor .view-lines')?.innerText.slice(0, 32).replace(/\\n/g, '⏎') ?? '(none)').join(' | ') || '(no editor)';
    return JSON.stringify({ side, tabs, editor });
  };
  let last = '';
  const t0 = performance.now();
  window.__stop = false;
  const tick = () => {
    const s = snap();
    if (s !== last) { window.__frames.push([Math.round(performance.now() - t0), s]); last = s; }
    if (!window.__stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
await new Promise(r => setTimeout(r, 150));
if (selector.startsWith('key:')) {
  const parts = selector.slice(4).split('+');
  const key = parts.pop();
  const modifiers = (parts.includes('alt') ? 1 : 0) | (parts.includes('ctrl') ? 2 : 0) | (parts.includes('meta') ? 4 : 0) | (parts.includes('shift') ? 8 : 0);
  const k = { key: key.toUpperCase(), code: 'Key' + key.toUpperCase(), windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), modifiers };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
} else {
  const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
await new Promise(r => setTimeout(r, +ms));
const frames = await evaluate('window.__stop = true, window.__frames');
const base = frames[1]?.[0] ?? 0;
for (const [t, s] of frames) {
  const o = JSON.parse(s);
  console.log(`${String(t - base).padStart(5)}ms  side=${o.side.padEnd(15)} tabs=[${o.tabs.join(', ')}]  editor=${o.editor}`);
}
ws.close();
