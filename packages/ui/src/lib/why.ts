/**
 * Why a run did what it did, from its log and nothing else: which calls went through on their own and
 * under which rule, which asked the owner and how that went, which the policy blocked, which tools it
 * never saw, and what stopped it early. The sentences are the page's; this only counts.
 */
import type { Envelope } from "./types";

export interface WhyAllowed { tool: string; n: number; rule: string }
export interface WhyAsked { tool: string; n: number; approved: number; declined: number; expired: number; grant: number; notes: string[] }
export interface WhyBlocked { tool: string; n: number; reason: string }
export interface Why {
  calls: number;
  allowed: WhyAllowed[];
  asked: WhyAsked[];
  blocked: WhyBlocked[];
  /** Tools the policy could never allow, so the model was never shown them. */
  hidden: string[];
  /** What ended the run before its work was done, in the log's words; null when it ran to the end. */
  stopped: string | null;
}

export function explainRun(events: Envelope[]): Why {
  const tool = new Map<string, string>();
  const allowed = new Map<string, WhyAllowed>();
  const asked = new Map<string, WhyAsked>();
  const blocked = new Map<string, WhyBlocked>();
  const askedCall = new Map<string, string>();
  let hidden: string[] = [];
  let calls = 0;
  let stopped: string | null = null;
  for (const { event: e } of events) {
    if (e.type === "tool.request") {
      const r = e["request"] as { server: string; tool: string };
      tool.set(e["callId"] as string, `${r.server}.${r.tool}`);
      calls++;
    } else if (e.type === "policy.decision") {
      const id = e["callId"] as string;
      const d = e["decision"] as { action: "allow" | "ask" | "block"; matched: string; reason: string };
      const name = tool.get(id) ?? "?";
      if (d.action === "allow") {
        const a = allowed.get(name) ?? { tool: name, n: 0, rule: d.matched };
        a.n++; allowed.set(name, a);
      } else if (d.action === "ask") {
        const a = asked.get(name) ?? { tool: name, n: 0, approved: 0, declined: 0, expired: 0, grant: 0, notes: [] };
        a.n++; asked.set(name, a); askedCall.set(id, name);
      } else {
        const b = blocked.get(name) ?? { tool: name, n: 0, reason: d.reason };
        b.n++; blocked.set(name, b);
      }
    } else if (e.type === "approval.resolved") {
      const name = askedCall.get(e["callId"] as string);
      const a = name ? asked.get(name) : undefined;
      if (!a) continue;
      const by = String(e["by"] ?? "");
      if (e["approved"]) { if (/^grant\b/.test(by)) a.grant++; else a.approved++; }
      else if (/expired/.test(by)) a.expired++;
      else a.declined++;
      if (typeof e["note"] === "string" && e["note"]) a.notes.push(e["note"] as string);
    } else if (e.type === "tools.offered") {
      hidden = (e["hidden"] as string[]) ?? [];
    } else if (e.type === "budget.exceeded") {
      stopped = "budget";
    } else if (e.type === "run.end") {
      const status = e["status"] as string;
      if (e["busy"]) stopped = "busy";
      else if (e["offline"]) stopped = "offline";
      else if (status === "budget_exceeded") stopped = "budget";
      else if (status === "max_turns") stopped = "max_turns";
      else if (status === "blocked") stopped = "blocked";
      else if (status === "error") stopped = `error: ${String(e["summary"] ?? "")}`;
    }
  }
  return { calls, allowed: [...allowed.values()], asked: [...asked.values()], blocked: [...blocked.values()], hidden, stopped };
}
