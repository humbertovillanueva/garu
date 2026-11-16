import { describe, expect, it } from "vitest";
import { doctor, type DoctorFacts } from "./doctor.js";

const now = new Date("2026-11-15T18:00:00.000Z");
const fine: DoctorFacts = {
  node: "22.11.0", dotEnv: true, keys: [{ name: "GEMINI_API_KEY", set: true }], optional: [{ name: "GARU_NOTIFY_URL", set: true, does: "pushes asks to the phone" }],
  agents: ["bea", "tomay"], problems: [],
  signIns: [{ agent: "bea", source: "agents/bea/Garufile.yaml", server: "gmail", at: new Date("2026-11-13T18:00:00.000Z"), google: true }],
  service: { installed: true, running: true }, tailscale: ["https://mac.ts.net/"], reachLost: null, pending: [], parked: 0, now,
};

describe("garu doctor", () => {
  it("a healthy computer gets only ticks", () => {
    const checks = doctor(fine);
    expect(checks.every((c) => c.verdict === "ok")).toBe(true);
    expect(checks.map((c) => c.text)).toEqual([
      "Node 22.11.0",
      "2 agents: bea, tomay",
      "every key the agents reference is set in .env (GEMINI_API_KEY)",
      "GARU_NOTIFY_URL is set: pushes asks to the phone",
      "bea's gmail sign-in is 2 days old (Google ends it at 7)",
      "the login service is running",
      "Tailscale serves the control room at https://mac.ts.net/",
      "nothing is waiting on you",
    ]);
  });

  it("names what is wrong, in the order a person would fix it", () => {
    const checks = doctor({
      ...fine, node: "20.3.0", keys: [{ name: "GEMINI_API_KEY", set: false }], problems: [{ source: "agents/x/Garufile.yaml", error: "bad cron" }],
      signIns: [
        { agent: "bea", source: "agents/bea/Garufile.yaml", server: "gmail", at: new Date("2026-11-09T18:00:00.000Z"), google: true },
        { agent: "tomay", source: "agents/tomay/Garufile.yaml", server: "calendar", at: null, google: true },
      ],
      service: { installed: true, running: false }, tailscale: [], reachLost: { since: "5:32 PM" },
      pending: [{ agent: "bea", tool: "gmail.create_draft", expiresAt: "2026-11-15T17:00:00.000Z" }, { agent: "pip", tool: "fs.write_file", expiresAt: "2026-11-16T17:00:00.000Z" }], parked: 1,
    });
    expect(checks.filter((c) => c.verdict === "bad").map((c) => c.text)).toEqual([
      "Node 20.3.0 is too old; Garu needs 22 or newer",
      "agents/x/Garufile.yaml doesn't load: bad cron",
      "GEMINI_API_KEY is referenced by an agent but not set in .env",
      "tomay's calendar is not signed in; run: garu auth agents/tomay/Garufile.yaml calendar",
      "the login service is installed but not running; `garu service restart` starts it",
      "Tailscale hasn't served the control room since 5:32 PM; the phone can't reach it. Open Tailscale on this computer.",
    ]);
    expect(checks.find((c) => c.text.startsWith("bea's"))).toMatchObject({ verdict: "warn", text: "bea's gmail sign-in is 6 days old; Google ends it at 7. Sign in again: garu auth agents/bea/Garufile.yaml gmail" });
    expect(checks.filter((c) => c.verdict === "warn").map((c) => c.text)).toContain("1 ask is past its time and will be declined at the next sweep: bea → gmail.create_draft");
    expect(checks.filter((c) => c.verdict === "warn").map((c) => c.text)).toContain("1 ask is waiting for you in the inbox");
    expect(checks.filter((c) => c.verdict === "warn").map((c) => c.text)).toContain("1 run is parked for your answer");
  });

  it("a sign-in Google already ended is a fault, not a warning", () => {
    const c = doctor({ ...fine, signIns: [{ agent: "bea", source: "a.yaml", server: "gmail", at: new Date("2026-11-07T18:00:00.000Z"), google: true }] });
    expect(c.find((x) => x.text.startsWith("bea's"))).toMatchObject({ verdict: "bad" });
  });
});
