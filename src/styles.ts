// Shared visual vocabulary for highlight lenses. Each style key maps to a look in dark and
// light themes. The same table drives editor decorations and the sidebar's example snippets.

export interface Look {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: 'solid' | 'wavy' | 'dotted';
  underlineColor?: string;
  border?: string;
  wholeLine?: boolean;
}

const DARK = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#f783ac', '#63e6be'];
const LIGHT = ['#c92a2a', '#d9480f', '#946c00', '#2b8a3e', '#1864ab', '#6741d9', '#c2255c', '#087f5b'];

type Pair = { dark: Look; light: Look };
const both = (i: number, extra: Look = {}): Pair => ({
  dark: { color: DARK[i], ...extra },
  light: { color: LIGHT[i], ...extra },
});

export const PALETTE_SIZE = DARK.length;

// Rainbow bracket order: depth 0 starts warm and walks around the wheel.
const RAINBOW = [2, 5, 4, 3, 1, 6];

const table: Record<string, Pair> = {};

for (let d = 0; d < RAINBOW.length; d++) table[`depth${d}`] = both(RAINBOW[d], { bold: true });

for (let d = 1; d <= 6; d++) {
  table[`ctx${d}`] = {
    dark: { background: `rgba(77, 171, 247, ${0.055 * d})`, wholeLine: true },
    light: { background: `rgba(24, 100, 171, ${0.05 * d})`, wholeLine: true },
  };
}

// Modules: alternate warm/cool so neighbouring imports never look alike.
const MODULE_ORDER = [4, 1, 3, 6, 2, 5, 7, 0];
for (let i = 0; i < PALETTE_SIZE; i++) table[`mod${i}`] = both(MODULE_ORDER[i], { bold: true });
table['modLocal'] = { dark: { color: '#adb5bd', italic: true }, light: { color: '#495057', italic: true } };

table['param'] = both(1, { bold: true });
table['paramDerived'] = both(6, { italic: true });
table['local'] = both(4);
table['global'] = both(7, { italic: true });

table['t-number'] = both(3);
table['t-string'] = both(2);
table['t-boolean'] = both(7);
table['t-array'] = both(1, { bold: true });
table['t-function'] = both(4);
table['t-promise'] = both(5, { bold: true });
table['t-object'] = both(6);
table['t-mixed'] = { dark: { color: '#ffffff', background: 'rgba(255, 107, 107, 0.25)' }, light: { color: '#000000', background: 'rgba(201, 42, 42, 0.18)' } };
table['t-any'] = both(0, { underline: 'wavy' });
table['t-nullable'] = {
  dark: { underline: 'dotted', underlineColor: '#ced4da' },
  light: { underline: 'dotted', underlineColor: '#343a40' },
};

table['throws'] = { dark: { color: DARK[0], bold: true, background: 'rgba(255, 107, 107, 0.15)' }, light: { color: LIGHT[0], bold: true, background: 'rgba(201, 42, 42, 0.1)' } };
table['throwsCall'] = both(0, { underline: 'wavy' });
table['throwStmt'] = { dark: { color: DARK[0], bold: true, border: `1px solid ${DARK[0]}` }, light: { color: LIGHT[0], bold: true, border: `1px solid ${LIGHT[0]}` } };
table['caught'] = both(3, { underline: 'solid' });
table['tryBlock'] = { dark: { background: 'rgba(105, 219, 124, 0.06)', wholeLine: true }, light: { background: 'rgba(43, 138, 62, 0.06)', wholeLine: true } };

table['changedFn'] = { dark: { color: DARK[1], bold: true, background: 'rgba(255, 169, 77, 0.18)' }, light: { color: LIGHT[1], bold: true, background: 'rgba(217, 72, 15, 0.12)' } };
table['changedCall'] = both(1, { underline: 'solid' });
table['changedBody'] = { dark: { background: 'rgba(255, 169, 77, 0.05)', wholeLine: true }, light: { background: 'rgba(217, 72, 15, 0.05)', wholeLine: true } };

export const STYLES = table;

export function lookToCss(l: Look): string {
  const parts: string[] = [];
  if (l.color) parts.push(`color:${l.color}`);
  if (l.background) parts.push(`background:${l.background}`);
  if (l.bold) parts.push('font-weight:bold');
  if (l.italic) parts.push('font-style:italic');
  if (l.underline) parts.push(`text-decoration:underline ${l.underline} ${l.underlineColor ?? 'currentColor'}`);
  if (l.border) parts.push(`outline:${l.border};border-radius:2px`);
  return parts.join(';');
}

/** CSS for webviews: `.s-<key>` classes for both themes. */
export function stylesCss(): string {
  let css = '';
  for (const [key, pair] of Object.entries(table)) {
    css += `body.vscode-dark .s-${key}, body.vscode-high-contrast .s-${key} {${lookToCss(pair.dark)}}\n`;
    css += `body.vscode-light .s-${key} {${lookToCss(pair.light)}}\n`;
  }
  return css;
}
