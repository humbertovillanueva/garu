import { describe, expect, it } from "vitest";
import { dockerArgs, explainDockerError } from "./sandbox.js";
import { Sandbox } from "./garufile.js";

const spec = { name: "fs", command: "mcp-server-filesystem", args: ["/workspace"], env: { FOO: "bar" } };

describe("dockerArgs", () => {
  it("builds a locked-down docker run with the workspace mounted", () => {
    const sb = Sandbox.parse({ workspace: "./examples/hello/workspace" });
    const out = dockerArgs(spec, sb, "hello", "/repo");
    expect(out.command).toBe("docker");
    expect(out.containerName).toMatch(/^garu-hello-fs-[0-9a-f]{8}$/);
    const a = out.args;
    expect(a.slice(0, 3)).toEqual(["run", "--rm", "-i"]);
    expect(a).toContain("--network"); expect(a[a.indexOf("--network") + 1]).toBe("none");
    expect(a[a.indexOf("--memory") + 1]).toBe("512m");
    expect(a[a.indexOf("--cpus") + 1]).toBe("1");
    expect(a).toContain("--read-only");
    expect(a[a.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(a).toContain("/repo/examples/hello/workspace:/workspace:rw");
    expect(a).toContain("FOO=bar");
    // image, then the real command and its args, last
    expect(a.slice(-3)).toEqual(["garu-sandbox", "mcp-server-filesystem", "/workspace"]);
  });

  it("honours image, network, limits and extra read-only mounts", () => {
    const sb = Sandbox.parse({
      image: "my/image:1", network: "bridge", memory: "2g", cpus: 2,
      mounts: [{ host: "./data", container: "/data", readonly: true }, { host: "/abs/out", container: "/out" }],
    });
    const a = dockerArgs(spec, sb, "x", "/repo").args;
    expect(a[a.indexOf("--network") + 1]).toBe("bridge");
    expect(a[a.indexOf("--memory") + 1]).toBe("2g");
    expect(a[a.indexOf("--cpus") + 1]).toBe("2");
    expect(a).toContain("/repo/data:/data:ro");
    expect(a).toContain("/abs/out:/out:rw");
    expect(a).not.toContain(expect.stringMatching(/:\/workspace:rw$/)); // no workspace given
    expect(a.at(-3)).toBe("my/image:1");
  });

  it("sanitises names used in the container name", () => {
    const sb = Sandbox.parse({});
    expect(dockerArgs({ ...spec, name: "we ird" }, sb, "Agent/One").containerName).toMatch(/^garu-Agent-One-we-ird-/);
  });
});

describe("Sandbox schema", () => {
  it("defaults to the strict profile", () => {
    expect(Sandbox.parse({})).toEqual({ image: "garu-sandbox", network: "none", mounts: [], memory: "512m", cpus: 1 });
  });
  it("rejects unknown network modes and absolute container paths that aren't absolute", () => {
    expect(() => Sandbox.parse({ network: "host" })).toThrow();
    expect(() => Sandbox.parse({ mounts: [{ host: "./a", container: "relative" }] })).toThrow(/absolute/);
  });
});

describe("explainDockerError", () => {
  it("gives actionable advice", () => {
    expect(explainDockerError("spawn docker ENOENT", "img")).toMatch(/Docker isn't installed/);
    expect(explainDockerError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock", "img")).toMatch(/not running/);
    expect(explainDockerError("Unable to find image 'img:latest' locally", "img")).toMatch(/garu sandbox build/);
    expect(explainDockerError("something else", "img")).toBe("something else");
  });
});
