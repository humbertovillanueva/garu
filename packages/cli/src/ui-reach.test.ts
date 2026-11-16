import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Reach } from "./ui-reach.js";

const at = (min: number) => new Date(Date.UTC(2026, 10, 15, 17, min));

describe("reach", () => {
  it("never warns on a computer that never had Tailscale", () => {
    const r = new Reach(join(mkdtempSync(join(tmpdir(), "reach-")), "reach.json"));
    expect(r.note([], at(0))).toBeNull();
    expect(r.note([], at(1))).toBeNull();
    expect(r.lost()).toBeNull();
  });

  it("says lost once when a known address is gone, and back once when it returns", () => {
    const file = join(mkdtempSync(join(tmpdir(), "reach-")), "reach.json");
    const r = new Reach(file);
    expect(r.note(["https://mac.tailnet.ts.net/"], at(0))).toBeNull();
    expect(r.lost()).toBeNull();
    expect(r.note([], at(5))).toBe("lost");
    expect(r.note([], at(6))).toBeNull();
    expect(r.lost()).toEqual({ since: at(5).toISOString(), url: "https://mac.tailnet.ts.net/" });
    // A restart reads the outage back from the file.
    expect(new Reach(file).lost()?.since).toBe(at(5).toISOString());
    expect(r.note(["https://mac.tailnet.ts.net/"], at(9))).toBe("back");
    expect(r.note(["https://mac.tailnet.ts.net/"], at(10))).toBeNull();
    expect(r.lost()).toBeNull();
  });

  it("rewrites the file for a new address or after ten minutes, not every half minute", () => {
    const file = join(mkdtempSync(join(tmpdir(), "reach-")), "reach.json");
    const r = new Reach(file);
    r.note(["https://a.ts.net/"], at(0));
    const first = readFileSync(file, "utf8");
    r.note(["https://a.ts.net/"], at(1));
    expect(readFileSync(file, "utf8")).toBe(first);
    r.note(["https://a.ts.net/"], at(11));
    expect(readFileSync(file, "utf8")).not.toBe(first);
    r.note(["https://b.ts.net/"], at(12));
    expect(JSON.parse(readFileSync(file, "utf8")).url).toBe("https://b.ts.net/");
  });
});
