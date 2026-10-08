// Round-trip and line-map invariants for every display style.
// Run: npm test   (corpus = sample/ + this repo's src/ + any paths given as arguments)
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as prettier from 'prettier';
import * as os from 'node:os';
import { allStyles, setCustomStyles } from '../src/format/styles';
import { toCanonical, toDisplay } from '../src/format/project';
import { buildLineMap } from '../src/format/lineMap';

const root = process.cwd();
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.[cm]?[jt]sx?$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = [...walk(path.join(root, 'sample')), ...walk(path.join(root, 'src')), ...process.argv.slice(2).flatMap(p => (fs.statSync(p).isDirectory() ? walk(p) : [p]))];

// Custom styles, as a user would write them in settings (one loads a .prettierrc file).
const rcFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lenses-')), '.prettierrc.json');
fs.writeFileSync(rcFile, JSON.stringify({ printWidth: 70, semi: false, quoteProps: 'consistent', parser: 'flow' }));
const problems = setCustomStyles([
  { name: 'Laptop', extends: 'narrow', prettier: { printWidth: 64, semi: false, singleQuote: true } },
  { name: 'Allman tabs', extends: 'tabs', braces: 'allman' },
  { name: 'Operators first', prettier: { experimentalOperatorPosition: 'start', experimentalTernaries: true, printWidth: 60 } },
  { name: 'From rc file', prettierConfigFile: rcFile, prettier: { arrowParens: 'avoid', bracketSpacing: false } },
  { name: 'Extends custom', extends: 'laptop', braces: 'allman' },
]);
if (problems.length) { console.log('custom style problems: ' + problems.join('; ')); process.exit(1); }
const STYLES = allStyles();
const bad = setCustomStyles([{ name: '' } as never, { name: 'X', extends: 'nope' }, { name: 'X' }]);
if (bad.length !== 3) { console.log('expected 3 problems for invalid custom styles, got: ' + bad.join('; ')); process.exit(1); }
setCustomStyles([
  { name: 'Laptop', extends: 'narrow', prettier: { printWidth: 64, semi: false, singleQuote: true } },
  { name: 'Allman tabs', extends: 'tabs', braces: 'allman' },
  { name: 'Operators first', prettier: { experimentalOperatorPosition: 'start', experimentalTernaries: true, printWidth: 60 } },
  { name: 'From rc file', prettierConfigFile: rcFile, prettier: { arrowParens: 'avoid', bracketSpacing: false } },
  { name: 'Extends custom', extends: 'laptop', braces: 'allman' },
]);

let failures = 0;
const fail = (msg: string) => { failures++; console.log('  FAIL ' + msg); };

(async () => {
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    // Canonical = Prettier defaults (the corpus has no .prettierrc of its own).
    const canonical = await prettier.format(raw, { filepath: file });
    const rel = path.relative(root, file);
    for (const style of STYLES) {
      const display = await toDisplay(canonical, file, style.id);
      const back = await toCanonical(display, file, canonical);
      if (back !== canonical) {
        const a = canonical.split('\n'), b = back.split('\n');
        const i = a.findIndex((l, k) => l !== b[k]);
        fail(`${rel} [${style.id}] round-trip differs at line ${i + 1}:\n      want: ${a[i]}\n      got:  ${b[i]}`);
        continue;
      }
      const map = buildLineMap(file, canonical, display);
      // Every non-blank canonical line must be labeled exactly once, in increasing order.
      const seen: number[] = [];
      for (const l of map.labels) {
        if (!l || l === '+') continue;
        const [from, to = from] = l.split('-').map(Number);
        for (let n = from; n <= to; n++) seen.push(n);
      }
      // Lines holding only optional punctuation like `});` are shown as continuations, not numbered.
      const want = canonical.split('\n').map((l, i) => (/^[\s;,()]*$/.test(l) ? 0 : i + 1)).filter(Boolean);
      const missing = want.filter(n => !seen.includes(n));
      const sorted = seen.every((n, i) => i === 0 || n > seen[i - 1]);
      if (missing.length) fail(`${rel} [${style.id}] canonical lines never labeled: ${missing.slice(0, 8).join(', ')}`);
      if (!sorted) fail(`${rel} [${style.id}] labels not increasing`);
      if (map.labels.includes('+')) fail(`${rel} [${style.id}] unmatched tokens in a pure reformat`);

      // Editing one identifier in the styled view must change only that canonical line.
      const m = /\b(const|let) ([A-Za-z_]\w*)/.exec(display);
      if (m) {
        const edited = display.slice(0, m.index) + `${m[1]} ${m[2]}Edited` + display.slice(m.index + m[0].length);
        const saved = await toCanonical(edited, file, canonical);
        const a = canonical.split('\n'), b = saved.split('\n');
        const changed = a.map((l, i) => (l !== b[i] ? i : -1)).filter(i => i >= 0);
        if (a.length !== b.length || changed.length !== 1) fail(`${rel} [${style.id}] one-token edit changed ${changed.length} line(s) (${a.length} -> ${b.length} lines)`);
      }
    }
  }
  console.log(`${files.length} files x ${STYLES.length} styles: ${failures ? failures + ' failure(s)' : 'all passed'}`);
  process.exit(failures ? 1 : 0);
})();
