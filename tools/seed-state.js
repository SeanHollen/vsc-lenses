// Seed VS Code UI state that isn't a setting. "Hide Accounts" (right-click the Accounts icon)
// is stored in the global state database, not settings.json, so it's written here before
// Lenses first starts. Uses node:sqlite (Node 22.5+); skips with a note if unavailable.
// Usage: node tools/seed-state.js <user-data-dir>
const fs = require('fs');
const path = require('path');

const STATE = {
  // Accounts button: mainly a Copilot sign-in entry point.
  'workbench.activity.showAccounts': 'false',
};

let DatabaseSync;
try {
  process.removeAllListeners('warning'); // node:sqlite prints an ExperimentalWarning on some versions
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.log(`  skipped: Node ${process.version} has no node:sqlite. Hide the Accounts icon by right-clicking it in Lenses.`);
  process.exit(0);
}
// A running VS Code holds <user-data-dir>/code.lock (removed on exit) and rewrites state when it
// quits, which would undo anything written now.
if (fs.existsSync(path.join(process.argv[2], 'code.lock'))) {
  console.log('  skipped: Lenses is running. Close all Lenses windows and re-run ./install.sh to hide the Accounts icon.');
  process.exit(0);
}
const dir = path.join(process.argv[2], 'User', 'globalStorage');
fs.mkdirSync(dir, { recursive: true });
try {
  const db = new DatabaseSync(path.join(dir, 'state.vscdb'));
  // VS Code's schema for this table.
  db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
  const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
  const has = db.prepare('SELECT 1 FROM ItemTable WHERE key = ?');
  const added = [];
  for (const [k, v] of Object.entries(STATE)) if (!has.get(k)) { insert.run(k, v); added.push(k); }
  db.close();
  console.log(added.length ? `  set ${added.join(', ')}` : '  state already up to date');
} catch (e) {
  console.log(`  skipped (${e.message}). Is Lenses running? Close it and re-run, or right-click the Accounts icon to hide it.`);
}
