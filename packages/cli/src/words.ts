/** A policy in plain words for the terminal: `garu try`, `garu install`, `garu new`. */
import { policyWords, type PolicyRule } from "@garu/kernel";
import { t } from "./i18n.js";

const list = (xs: { tool: string; when?: string }[]) => xs.map((x) => (x.when ? t("{tool} when {condition}", { tool: x.tool, condition: x.when }) : x.tool)).join(", ");

/** Three or four lines: what it does on its own, what it asks about, what it never does, and the rest. */
export function policyLines(rules: readonly PolicyRule[]): string[] {
  const w = policyWords(rules);
  const out: string[] = [];
  if (w.allows.length) out.push(t("On its own: {list}", { list: list(w.allows) }));
  if (w.asks.length) out.push(t("Asks you first: {list}", { list: list(w.asks) }));
  if (w.blocks.length) out.push(t("Never: {list}", { list: list(w.blocks) }));
  out.push(w.otherwise === "block" ? t("Anything else: blocked") : w.otherwise === "allow" ? t("Anything else: allowed without asking") : t("Anything else: asks you"));
  return out;
}
