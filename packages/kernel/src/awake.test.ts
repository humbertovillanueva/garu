import { describe, expect, it } from "vitest";
import { holdAwake } from "./awake.js";

describe("holdAwake", () => {
  it("asks macOS not to idle into sleep for as long as the run lasts, and does nothing elsewhere", () => {
    const calls: { cmd: string; args: readonly string[] }[] = [];
    let killed = 0;
    const spawn = ((cmd: string, args: readonly string[]) => {
      calls.push({ cmd, args });
      return { kill: () => (killed++, true), on: () => undefined };
    }) as unknown as typeof import("node:child_process").spawn;
    const release = holdAwake({ platform: "darwin", spawn });
    expect(calls).toEqual([{ cmd: "caffeinate", args: ["-i", "-w", String(process.pid)] }]);
    release();
    expect(killed).toBe(1);
    const none = holdAwake({ platform: "linux", spawn });
    none();
    expect(calls).toHaveLength(1);
  });
});
