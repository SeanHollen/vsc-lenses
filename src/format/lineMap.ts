import { align, tokenize } from './align';

// Maps display lines back to canonical lines by aligning the two token streams.

export interface LineMap {
  /** Per display line: the label to show in the gutter ('' for none). */
  labels: string[];
  /** Per display line: whether the label is a continuation of an earlier line. */
  continuation: boolean[];
  /** Per display line: canonical line (0-based) it starts in, or -1. */
  displayToCanonical: number[];
  /** Per canonical line: first display line containing it, or -1. */
  canonicalToDisplay: number[];
  canonicalLineCount: number;
}

export function buildLineMap(fileName: string, canonical: string, display: string): LineMap {
  const a = tokenize(fileName, canonical);
  const b = tokenize(fileName, display);
  const displayText = display.split('\n');
  const displayLines = displayText.length;
  const canonicalLines = canonical.split('\n').length;

  // b[j] -> canonical line, or -1 for tokens that only exist in the display (new edits).
  const mapped = align(a, b);

  const perLine: number[][] = Array.from({ length: displayLines }, () => []);
  const hasNew = new Array<boolean>(displayLines).fill(false);
  b.forEach((t, k) => {
    if (mapped[k] < 0) { hasNew[t.line] = true; return; }
    // A multi-line token (template literal, block comment) maps line-for-line.
    const src = a[mapped[k]];
    for (let d = 0; d <= t.endLine - t.line; d++) perLine[t.line + d].push(Math.min(src.line + d, src.endLine));
  });

  const labels: string[] = [];
  const continuation: boolean[] = [];
  const displayToCanonical: number[] = [];
  const canonicalToDisplay = new Array<number>(canonicalLines).fill(-1);
  let highest = -1; // highest canonical line already labeled
  for (let d = 0; d < displayLines; d++) {
    const lines = perLine[d];
    if (lines.length === 0) {
      // Lines with only punctuation like `);` continue the statement above.
      const punctuationOnly = !hasNew[d] && displayText[d].trim() !== '' && highest >= 0;
      labels.push(hasNew[d] ? '+' : '');
      continuation.push(punctuationOnly);
      displayToCanonical.push(-1);
      continue;
    }
    const lo = Math.min(...lines);
    const hi = Math.max(...lines);
    displayToCanonical.push(lo);
    for (const l of lines) if (canonicalToDisplay[l] < 0) canonicalToDisplay[l] = d;
    if (hi <= highest) {
      // Every token here belongs to a canonical line that already started above.
      labels.push('');
      continuation.push(true);
    } else {
      const from = Math.max(lo, highest + 1);
      labels.push(from === hi ? `${from + 1}` : `${from + 1}-${hi + 1}`);
      continuation.push(false);
      highest = hi;
    }
  }
  // Canonical lines with no tokens (blank lines) point at the next mapped display line.
  for (let c = canonicalLines - 1, next = displayLines - 1; c >= 0; c--) {
    if (canonicalToDisplay[c] >= 0) next = canonicalToDisplay[c];
    else canonicalToDisplay[c] = next;
  }
  return { labels, continuation, displayToCanonical, canonicalToDisplay, canonicalLineCount: canonicalLines };
}
