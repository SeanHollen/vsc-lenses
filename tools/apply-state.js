// Apply Lenses settings that VS Code keeps as UI state instead of settings. "Show Accounts"
// (right-click the activity bar) lives in the global state database, so `lenses.editor.showAccounts`
// is copied there before Lenses starts. Run by the `lenses` launcher on every start and by
// install.sh. It only writes when the setting changed since it was last applied, so hiding or
// showing the icon by right-click still sticks. Needs node:sqlite (Node 22.5+).
// Usage: node apply-state.js <user-data-dir> [--quiet]
const fs = require('fs');
const path = require('path');

const [userData, flag] = process.argv.slice(2);
const quiet = flag === '--quiet';
const say = msg => quiet || console.log(`  ${msg}`);

// Read settings.json (JSONC: drop comments and trailing commas outside strings).
let settings = {};
try {
  const text = fs.readFileSync(path.join(userData, 'User', 'settings.json'), 'utf8')
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '')
    .replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (m, str, tail) => str ?? tail);
  settings = JSON.parse(text.trim() || '{}');
} catch {}

// setting -> state key, with Lenses' default for the setting.
const STATE = [
  { setting: 'lenses.editor.showAccounts', key: 'workbench.activity.showAccounts', default: false },
];

let DatabaseSync;
try {
  process.removeAllListeners('warning'); // node:sqlite prints an ExperimentalWarning on some versions
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  say(`skipped: Node ${process.version} has no node:sqlite. Show or hide the Accounts icon by right-clicking the activity bar.`);
  process.exit(0);
}
// A running VS Code holds <user-data-dir>/code.lock (removed on exit) and rewrites state when it
// quits, which would undo anything written now.
if (fs.existsSync(path.join(userData, 'code.lock'))) {
  say('skipped: Lenses is running. The Accounts setting is applied the next time Lenses starts.');
  process.exit(0);
}
const dir = path.join(userData, 'User', 'globalStorage');
fs.mkdirSync(dir, { recursive: true });
try {
  const db = new DatabaseSync(path.join(dir, 'state.vscdb'));
  // VS Code's schema for this table.
  db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
  const put = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
  const get = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
  const changed = [];
  for (const s of STATE) {
    const value = String(settings[s.setting] ?? s.default);
    const marker = `lenses.applied:${s.setting}`;
    if (get.get(marker)?.value === value) continue;
    put.run(s.key, value);
    put.run(marker, value);
    changed.push(`${s.key}=${value}`);
  }
  db.close();
  say(changed.length ? `set ${changed.join(', ')}` : 'state already up to date');
} catch (e) {
  say(`skipped (${e.message}). Is Lenses running? Close it and re-run.`);
}
