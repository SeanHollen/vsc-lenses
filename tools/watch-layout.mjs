// Poll the workbench from the earliest moment CDP can attach and report whether the
// right-hand (auxiliary) side bar or the Accounts button is ever visible, even briefly.
// Usage: node tools/watch-layout.mjs <port> <seconds>
const [port, seconds = 15] = process.argv.slice(2);
const deadline = Date.now() + seconds * 1000;
const seen = { auxBarVisibleMs: 0, accountsVisible: false, samples: 0, firstSampleAt: null };
const t0 = Date.now();
while (Date.now() < deadline) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = targets.find(t => t.type === 'page' && /workbench/.test(t.url));
    if (!page) { await new Promise(r => setTimeout(r, 50)); continue; }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const evaluate = expr => new Promise(res => {
      const i = ++id;
      ws.addEventListener('message', function on(e) { const m = JSON.parse(e.data); if (m.id === i) { ws.removeEventListener('message', on); res(m.result?.result?.value); } });
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });
    while (Date.now() < deadline) {
      const s = await evaluate(`(() => { const a = document.querySelector('.part.auxiliarybar'); const r = a && a.getBoundingClientRect(); const acc = [...document.querySelectorAll('.activitybar [aria-label^="Accounts"]')].some(e => e.getBoundingClientRect().width > 0); return { aux: !!(a && r.width > 0 && getComputedStyle(a).display !== 'none' && getComputedStyle(a).visibility !== 'hidden'), acc, ready: !!document.querySelector('.monaco-workbench') }; })()`);
      if (s?.ready) {
        seen.samples++;
        seen.firstSampleAt ??= Date.now() - t0;
        if (s.aux) seen.auxBarVisibleMs += 50;
        if (s.acc) seen.accountsVisible = true;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    ws.close();
  } catch { await new Promise(r => setTimeout(r, 50)); }
}
console.log(JSON.stringify(seen));
process.exit(0);
