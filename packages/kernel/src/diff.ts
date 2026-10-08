/**
 * A small line diff, for showing what a file write would change. Files agents
 * write are logs, briefs and summaries: a few hundred lines at most, so a plain
 * LCS is fine. Anything bigger is shown as "replaced" rather than diffed.
 */
export type DiffLine = { t: "=" | "+" | "-"; s: string };

const MAX_LINES = 4000;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  if (a.length * b.length > MAX_LINES * MAX_LINES) {
    return [...a.map((s) => ({ t: "-" as const, s })), ...b.map((s) => ({ t: "+" as const, s }))];
  }
  // Trim the common head and tail first: most writes are "append a line".
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);
  // LCS on the middle.
  const n = am.length, m = bm.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = am[i] === bm[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const mid: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (am[i] === bm[j]) { mid.push({ t: "=", s: am[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { mid.push({ t: "-", s: am[i]! }); i++; }
    else { mid.push({ t: "+", s: bm[j]! }); j++; }
  }
  while (i < n) mid.push({ t: "-", s: am[i++]! });
  while (j < m) mid.push({ t: "+", s: bm[j++]! });
  return [...a.slice(0, head).map((s) => ({ t: "=" as const, s })), ...mid, ...a.slice(a.length - tail).map((s) => ({ t: "=" as const, s }))];
}

export function diffStats(d: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0, removed = 0, unchanged = 0;
  for (const l of d) { if (l.t === "+") added++; else if (l.t === "-") removed++; else unchanged++; }
  return { added, removed, unchanged };
}
