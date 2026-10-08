import { describe, expect, it } from "vitest";
import { launchdLabel, launchdPlist, serviceName, servicePath, systemdUnit } from "./service.js";

const spec = { root: "/Users/h/garu", node: "/opt/homebrew/bin/node", entry: "/Users/h/garu/packages/cli/dist/index.js", args: ["--up", "--as", "Humberto V", "--port", "4000"], path: "/opt/homebrew/bin:/usr/bin:/bin" };

describe("garu service", () => {
  it("names the service after the folder, uniquely", () => {
    expect(serviceName("/Users/h/garu")).toMatch(/^garu-garu-[0-9a-f]{8}$/);
    expect(serviceName("/Users/h/garu")).not.toBe(serviceName("/Users/h/other/garu"));
    expect(serviceName("/srv/My Agents!")).toMatch(/^garu-my-agents-/);
    expect(launchdLabel("/Users/h/garu")).toMatch(/^io\.github\.humbertovillanueva\.garu-garu-/);
  });

  it("writes a launchd plist that runs garu ui in the project folder and keeps it alive", () => {
    const p = launchdPlist(spec);
    expect(p).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(p).toContain("<string>/Users/h/garu/packages/cli/dist/index.js</string>");
    expect(p).toContain("<string>ui</string>\n    <string>--up</string>");
    expect(p).toContain("<string>Humberto V</string>");
    expect(p).toContain("<key>WorkingDirectory</key><string>/Users/h/garu</string>");
    expect(p).toContain("<key>KeepAlive</key><true/>");
    expect(p).toContain("/Users/h/garu/.garu/ui.log");
  });

  it("writes a systemd unit with quoting where needed", () => {
    const u = systemdUnit(spec);
    expect(u).toContain("WorkingDirectory=/Users/h/garu");
    expect(u).toContain('ExecStart=/opt/homebrew/bin/node /Users/h/garu/packages/cli/dist/index.js ui --up --as "Humberto V" --port 4000');
    expect(u).toContain("Restart=always");
    expect(u).toContain("WantedBy=default.target");
  });

  it("builds a PATH that still finds homebrew and docker from an empty environment", () => {
    const p = servicePath(undefined, "darwin");
    expect(p.split(":")).toContain("/opt/homebrew/bin");
    expect(p.split(":")).toContain("/Applications/Docker.app/Contents/Resources/bin");
    expect(servicePath("/x:/usr/bin", "linux").split(":")[0]).toBe("/x");
    expect(servicePath("/usr/bin:/usr/bin", "linux").split(":").filter((s) => s === "/usr/bin")).toHaveLength(1);
  });
});
