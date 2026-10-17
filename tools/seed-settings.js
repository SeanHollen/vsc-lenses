// Merge Lenses' editor defaults into a VS Code settings.json, adding only keys that are not
// already set (so re-running install.sh never overrides the user's choices).
// These must be real settings, not extension `configurationDefaults`: VS Code lays out the
// window (e.g. the right-hand side bar) before extensions load.
// Usage: node tools/seed-settings.js <settings.json>
const fs = require('fs');

const DEFAULTS = {
  // No built-in AI: Copilot chat, agents, inline AI suggestions.
  'chat.disableAIFeatures': true,
  'chat.agentsControl.enabled': 'hidden',
  // Its leftover: the right-hand side bar (home of the chat panel). The Accounts button is UI
  // state rather than a setting; see lenses.editor.showAccounts and apply-state.js.
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  // Auto-save; styled views hold saves until the code parses.
  'files.autoSave': 'afterDelay',
  'files.autoSaveWhenNoErrors': true,
  // No Restricted Mode: every folder on this machine is trusted, with no prompt or banner.
  // Read at startup, so it must be in settings.json.
  'security.workspace.trust.enabled': false,
};

const file = process.argv[2];
const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}';
// settings.json may be JSONC: drop comments and trailing commas (outside strings) before parsing.
const stripped = text
  .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '')
  .replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (m, str, tail) => str ?? tail);
let settings;
try {
  settings = JSON.parse(stripped.trim() || '{}');
} catch (e) {
  console.error(`  couldn't parse ${file} (${e.message}); add these yourself:\n${JSON.stringify(DEFAULTS, null, 2)}`);
  process.exit(0);
}
const added = Object.keys(DEFAULTS).filter(k => !(k in settings));
if (!added.length) { console.log('  settings already up to date'); process.exit(0); }
for (const k of added) settings[k] = DEFAULTS[k];
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
console.log(`  added ${added.join(', ')}`);
