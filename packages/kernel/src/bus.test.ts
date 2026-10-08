import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ToolBus, expandSpec } from "./bus.js";
import { PolicyEngine } from "./policy.js";
import { Recorder, readRun } from "./recorder.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "testing", "echo-server.mjs");

describe("ToolBus (real MCP server over stdio)", () => {
  let bus: ToolBus;
  let rec: Recorder;
  const approvals: string[] = [];
  let approveNext = true;

  beforeAll(async () => {
    rec = new Recorder({ root: mkdtempSync(join(tmpdir(), "garu-")), agent: "bus-test" });
    bus = new ToolBus({
      policy: new PolicyEngine([
        { tool: "echo.echo", action: "allow" },
        { tool: "echo.add", action: "ask" },
        { tool: "echo.danger", action: "block", reason: "never" },
        { tool: "*", action: "allow" },
      ]),
      recorder: rec,
      approver: async (req) => {
        approvals.push(`${req.server}.${req.tool}`);
        return { approved: approveNext, by: "test" };
      },
    });
    await bus.connect([{ name: "echo", command: "node", args: [serverPath], env: {} }]);
  }, 30_000);

  afterAll(async () => {
    await bus.close();
  });

  it("discovers tools under <server>.<tool>", () => {
    const names = bus.listTools().map((t) => t.qualified).sort();
    expect(names).toEqual(["echo.add", "echo.danger", "echo.echo", "echo.fail"]);
  });

  it("allow → calls the server and returns content", async () => {
    const out = await bus.call("echo.echo", { text: "hi" });
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.result).toEqual([{ type: "text", text: "hi" }]);
  });

  it("block → never reaches the server", async () => {
    const out = await bus.call("echo.danger", { target: "prod" });
    expect(out.status).toBe("blocked");
    expect(approvals).not.toContain("echo.danger");
  });

  it("ask → approver decides, approval is honored", async () => {
    approveNext = true;
    const ok = await bus.call("echo.add", { a: 2, b: 3 });
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") expect(ok.result).toEqual([{ type: "text", text: "5" }]);

    approveNext = false;
    const denied = await bus.call("echo.add", { a: 1, b: 1 });
    expect(denied.status).toBe("denied");
    expect(approvals.filter((a) => a === "echo.add")).toHaveLength(2);
  });

  it("server-side errors surface as error, not throw", async () => {
    const out = await bus.call("echo.fail", {});
    expect(out.status).toBe("error");
    if (out.status === "error") expect(out.error).toBe("nope");
  });

  it("unknown tools are errors and still logged", async () => {
    const out = await bus.call("nope.tool", {});
    expect(out.status).toBe("error");
  });

  it("the flight recorder saw everything, in order", () => {
    const types = readRun(rec.path).map((e) => e.event.type);
    // first call: allow
    expect(types.slice(0, 3)).toEqual(["tool.request", "policy.decision", "tool.result"]);
    // there must be an approval pair for each ask
    expect(types.filter((t) => t === "approval.requested")).toHaveLength(2);
    expect(types.filter((t) => t === "approval.resolved")).toHaveLength(2);
    // nothing after a block
    const blockIdx = readRun(rec.path).findIndex(
      (e) => e.event.type === "policy.decision" && e.event.decision.action === "block",
    );
    expect(blockIdx).toBeGreaterThan(0);
    const after = readRun(rec.path)[blockIdx + 1];
    expect(after?.event.type).toBe("tool.request"); // next call, not a tool.result for the blocked one
  });
});

describe("ToolBus retries a server that dies while starting", () => {
  it("records tools.retry, then connects", async () => {
    const dir = mkdtempSync(join(tmpdir(), "garu-flaky-"));
    const rec = new Recorder({ root: dir, agent: "flaky" });
    const bus = new ToolBus({ policy: new PolicyEngine([{ tool: "*", action: "allow" }]), recorder: rec, approver: async () => ({ approved: true, by: "t" }), startupRetryMs: 50 });
    await bus.connect([{ name: "echo", command: "node", args: [join(here, "testing", "flaky-server.mjs"), join(dir, "started-once")], env: {} }]);
    expect(bus.listTools().map((t) => t.qualified)).toContain("echo.echo");
    const events = readRun(rec.path).map((e) => e.event);
    const retry = events.find((e) => e.type === "tools.retry");
    expect(retry).toMatchObject({ type: "tools.retry", server: "echo", attempt: 1, maxAttempts: 2, waitMs: 50 });
    await bus.close();
  }, 30_000);

  it("does not retry a command that does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "garu-noent-"));
    const rec = new Recorder({ root: dir, agent: "noent" });
    const bus = new ToolBus({ policy: new PolicyEngine([{ tool: "*", action: "allow" }]), recorder: rec, approver: async () => ({ approved: true, by: "t" }), startupRetryMs: 50 });
    await expect(bus.connect([{ name: "nope", command: "definitely-not-a-command-xyz", args: [], env: {} }])).rejects.toThrow(/failed to start/);
    expect(readRun(rec.path).some((e) => e.event.type === "tools.retry")).toBe(false);
  }, 30_000);
});

describe("expandSpec", () => {
  const spec = { name: "web", command: "node", args: ["server.js", "--token=${TOKEN}"], env: { WEBHOOK_URL: "${HOOK}", PLAIN: "x" } };
  it("fills ${VAR} from the environment", () => {
    const out = expandSpec(spec, { TOKEN: "t1", HOOK: "https://h" });
    expect(out.args).toEqual(["server.js", "--token=t1"]);
    expect(out.env).toEqual({ WEBHOOK_URL: "https://h", PLAIN: "x" });
  });
  it("fails loudly when a variable is missing or empty", () => {
    expect(() => expandSpec(spec, { TOKEN: "t1" })).toThrow(/env WEBHOOK_URL needs \$\{HOOK\} but it is not set/);
    expect(() => expandSpec(spec, { TOKEN: "", HOOK: "h" })).toThrow(/argument needs \$\{TOKEN\}/);
  });
});
