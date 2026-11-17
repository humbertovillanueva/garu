/**
 * Small edits to a Garufile from the control room: the schedule, the runs a day, the cap per run,
 * the notebook. Done on the YAML document, not on the parsed object, so the owner's comments and
 * order stay exactly as they wrote them; the result is parsed before it is written, so a bad edit
 * never lands.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { parseGarufile, type Garufile } from "./garufile.js";
import { assertValidCron } from "./scheduler.js";

export interface GarufileEdits {
  /** The cron of the first cron trigger; null removes the schedule (the agent runs when asked). */
  cron?: string | null;
  /** null removes the cap. */
  maxRunsPerDay?: number | null;
  /** null removes the cap. */
  maxCostUsd?: number | null;
  memory?: boolean;
}

/** The edited text, parsed and valid, without touching the file. */
export function editGarufileText(text: string, edits: GarufileEdits, source = "Garufile.yaml"): { text: string; garufile: Garufile } {
  const doc = parseDocument(text);
  if (edits.cron !== undefined) {
    if (edits.cron !== null) assertValidCron(edits.cron);
    const triggers = doc.get("triggers", true);
    const list = triggers && typeof triggers === "object" && "items" in triggers ? (triggers as { items: unknown[] }).items : [];
    const at = list.findIndex((item) => item && typeof item === "object" && "has" in item && (item as { has: (k: string) => boolean }).has("cron"));
    if (edits.cron === null) {
      if (at >= 0) doc.deleteIn(["triggers", at]);
      const left = doc.getIn(["triggers"]) as { items?: unknown[] } | undefined;
      if (!left || !left.items?.length) doc.set("triggers", [{ manual: true }]);
    } else if (at >= 0) {
      doc.setIn(["triggers", at, "cron"], edits.cron);
    } else {
      // No cron yet: the schedule goes first, and a lone `manual: true` makes way for it.
      const manualOnly = list.length === 1 && list[0] && typeof list[0] === "object" && "has" in list[0] && (list[0] as { has: (k: string) => boolean }).has("manual");
      if (manualOnly) doc.setIn(["triggers", 0], { cron: edits.cron });
      else doc.set("triggers", [{ cron: edits.cron }, ...list]);
    }
  }
  for (const key of ["maxRunsPerDay", "maxCostUsd"] as const) {
    const v = edits[key];
    if (v === undefined) continue;
    if (v === null) {
      doc.deleteIn(["budget", key]);
      const b = doc.get("budget") as { items?: unknown[] } | undefined;
      if (b && (!b.items || b.items.length === 0)) doc.delete("budget");
    } else {
      doc.setIn(["budget", key], v);
    }
  }
  if (edits.memory !== undefined) {
    if (edits.memory) doc.set("memory", true);
    else doc.delete("memory");
  }
  const out = doc.toString();
  return { text: out, garufile: parseGarufile(out, source) };
}

/** Edit the file in place; nothing is written unless the result parses. */
export function editGarufile(path: string, edits: GarufileEdits): Garufile {
  const { text, garufile } = editGarufileText(readFileSync(path, "utf8"), edits, path);
  writeFileSync(path, text);
  return garufile;
}
