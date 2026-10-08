// Minimal Chrome DevTools Protocol driver for the VS Code window (used for testing/screenshots).
// Usage: node tools/cdp.mjs <port> <cmd> [args...]
//   shot <out.png>             capture screenshot
//   eval <js>                  evaluate in the workbench renderer, print result
//   keys <combo>...            press key combos, e.g. ctrl+shift+p, Enter, "text:hello"
//   click <css-selector>       click center of first matching element
//   command <title>            run a command via the command palette (exact title match)
//   wheel <x> <y> <dy>         scroll at a point (e.g. inside a webview)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [port, cmd, ...args] = process.argv.slice(2);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json(), () => {
  console.error(`no VS Code listening on port ${port} (start it with tools/launch.sh)`);
  process.exit(2);
});
const page = targets.find(t => t.type === 'page' && /workbench/.test(t.url)) ?? targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

const KEYS = { Enter: [13, '\r'], Escape: [27], Tab: [9, '\t'], Backspace: [8], Delete: [46], ArrowDown: [40], ArrowUp: [38], ArrowLeft: [37], ArrowRight: [39], Home: [36], End: [35], PageDown: [34], PageUp: [33], F1: [112] };
async function press(combo) {
  if (combo.startsWith('text:')) { await send('Input.insertText', { text: combo.slice(5) }); return; }
  const parts = combo.split('+');
  const key = parts.pop();
  const mods = (parts.includes('alt') ? 1 : 0) | (parts.includes('ctrl') ? 2 : 0) | (parts.includes('meta') ? 4 : 0) | (parts.includes('shift') ? 8 : 0);
  let code, text;
  if (KEYS[key]) [code, text] = KEYS[key];
  else { code = key.toUpperCase().charCodeAt(0); text = mods & ~8 ? undefined : (mods & 8 ? key.toUpperCase() : key); }
  const keyName = KEYS[key] ? key : (key.length === 1 ? key : key);
  const codeName = KEYS[key] ? key : (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /[0-9]/.test(key) ? 'Digit' + key : key);
  await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', modifiers: mods, windowsVirtualKeyCode: code, key: keyName, code: codeName, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: mods, windowsVirtualKeyCode: code, key: keyName, code: codeName });
  await sleep(60);
}
async function click(sel) {
  const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error('no element ' + sel);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(args[0], Buffer.from(r.data, 'base64'));
  console.log('saved', args[0]);
} else if (cmd === 'eval') {
  console.log(JSON.stringify(await evaluate(args[0]), null, 1));
} else if (cmd === 'keys') {
  for (const k of args) await press(k);
} else if (cmd === 'click') {
  await click(args[0]);
} else if (cmd === 'clickxy') {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: +args[0], y: +args[1], button: 'left', clickCount: 1 });
} else if (cmd === 'wheel') {
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +args[0], y: +args[1], deltaX: 0, deltaY: +args[2] });
} else if (cmd === 'command') {
  // Only type once the palette is really open, so text never lands in an editor.
  const open = () => evaluate(`(() => { const w = document.querySelector('.quick-input-widget'); return !!w && w.style.display !== 'none' && document.activeElement?.closest('.quick-input-widget') != null; })()`);
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    if (i % 5 === 0) await press('ctrl+shift+p');
    await sleep(250);
    ok = await open();
  }
  if (!ok) { console.error('command palette did not open'); process.exit(1); }
  await send('Input.insertText', { text: args[0] });
  // Pick the row whose label matches exactly. Fuzzy ranking (and recently-used ordering)
  // can put a different command first, so never just press Enter on row one.
  let index = -1;
  for (let i = 0; i < 12 && index < 0; i++) {
    await sleep(250);
    index = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.quick-input-widget .monaco-list-row')];
      const label = r => (r.querySelector('.label-name')?.textContent ?? '').replace(/\\s+/g, ' ').trim();
      const want = ${JSON.stringify(args[0])}.toLowerCase();
      let i = rows.findIndex(r => label(r).toLowerCase() === want);
      if (i < 0) i = rows.findIndex(r => label(r).toLowerCase().startsWith(want));
      return i;
    })()`);
  }
  if (index < 0) {
    const seen = await evaluate(`[...document.querySelectorAll('.quick-input-widget .monaco-list-row .label-name')].slice(0, 5).map(e => e.textContent)`);
    await press('Escape');
    console.error(`no command matching ${JSON.stringify(args[0])}; palette showed: ${JSON.stringify(seen)}`);
    process.exit(1);
  }
  for (let i = 0; i < index; i++) await press('ArrowDown');
  await press('Enter');
}
await sleep(100);
ws.close();

// CDP only sees the rendered page. Native OS windows (save prompts, file pickers) are
// invisible to it, so check for them after every command and fail loudly.
const nativeArgs = [path.join(path.dirname(new URL(import.meta.url).pathname), 'native.py')];
if (cmd === 'shot') nativeArgs.push(args[0].replace(/\.png$/, '') + '-native');
const native = spawnSync('python3', nativeArgs, { encoding: 'utf8' });
if (native.status === 3) {
  console.error('WARNING: native window(s) open in the test VS Code; CDP screenshots cannot show them:');
  console.error(native.stdout.trim().replace(/^/gm, '  '));
  process.exit(3);
}
process.exit(0);
