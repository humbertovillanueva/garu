import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverGarufiles } from "./discover.js";

const good = (name: string) => `name: ${name}\nmodel: fake/x\nprompt: p\n`;

describe("discoverGarufiles", () => {
  it("finds Garufiles, skips junk dirs, reports broken ones and duplicates", () => {
    const root = mkdtempSync(join(tmpdir(), "disc-"));
    mkdirSync(join(root, "examples", "a"), { recursive: true });
    mkdirSync(join(root, "examples", "b"), { recursive: true });
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    mkdirSync(join(root, "dup"), { recursive: true });
    mkdirSync(join(root, "bad"), { recursive: true });
    writeFileSync(join(root, "examples", "a", "Garufile.yaml"), good("alpha"));
    writeFileSync(join(root, "examples", "b", "Garufile.yml"), good("beta"));
    writeFileSync(join(root, "node_modules", "x", "Garufile.yaml"), good("ignored"));
    writeFileSync(join(root, "dup", "Garufile.yaml"), good("alpha"));
    writeFileSync(join(root, "bad", "Garufile.yaml"), "name: [oops\n");

    const { agents, problems } = discoverGarufiles(root);
    expect(agents.map((a) => a.garufile.name)).toEqual(["alpha", "beta"]);
    expect(agents[0]!.source).toBe("dup/Garufile.yaml"); // "dup" sorts before "examples", so it wins the name
    expect(problems.map((p) => p.source).sort()).toEqual(["bad/Garufile.yaml", "examples/a/Garufile.yaml"]);
    expect(problems.find((p) => p.source.startsWith("bad"))!.error).toMatch(/invalid YAML/);
  });

  it("respects max depth and a missing root", () => {
    const root = mkdtempSync(join(tmpdir(), "disc-"));
    mkdirSync(join(root, "1", "2", "3", "4", "5"), { recursive: true });
    writeFileSync(join(root, "1", "2", "3", "4", "5", "Garufile.yaml"), good("deep"));
    expect(discoverGarufiles(root, 3).agents).toEqual([]);
    expect(discoverGarufiles(root, 6).agents).toHaveLength(1);
    expect(discoverGarufiles(join(root, "nope")).agents).toEqual([]);
  });
});
