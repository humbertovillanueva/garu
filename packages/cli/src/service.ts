/**
 * `garu service`: run the control room (and the schedules) as a login service,
 * so a reboot doesn't take your agents down. launchd on macOS, systemd --user on
 * Linux. One service per project folder; the folder's hash is in the name.
 */
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export interface ServiceSpec {
  /** Project root — Garufiles are discovered under here; .env lives here. */
  root: string;
  /** The node binary and the garu entry point, so the service runs exactly what you run. */
  node: string;
  entry: string;
  /** Arguments after `ui`. */
  args: string[];
  /** PATH for the service: launchd gives almost nothing, and agents need docker/ollama/npx. */
  path: string;
}

export function serviceName(root: string): string {
  const slug = basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "garu";
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return `garu-${slug}-${hash}`;
}

export function logPath(root: string): string {
  return join(root, ".garu", "ui.log");
}

export function launchdLabel(root: string): string {
  return `io.github.humbertovillanueva.${serviceName(root)}`;
}
export function launchdPlistPath(root: string): string {
  return join(homedir(), "Library", "LaunchAgents", `${launchdLabel(root)}.plist`);
}
export function systemdUnitPath(root: string): string {
  return join(process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "systemd", "user", `${serviceName(root)}.service`);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function launchdPlist(spec: ServiceSpec): string {
  const argv = [spec.node, spec.entry, "ui", ...spec.args];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(launchdLabel(spec.root))}</string>
  <key>ProgramArguments</key>
  <array>
${argv.map((a) => `    <string>${xml(a)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(spec.root)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(spec.path)}</string>
    <key>HOME</key><string>${xml(homedir())}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(logPath(spec.root))}</string>
  <key>StandardErrorPath</key><string>${xml(logPath(spec.root))}</string>
</dict>
</plist>
`;
}

const sh = (s: string) => (/^[A-Za-z0-9_./:=@%+-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, "\\$1")}"`);

export function systemdUnit(spec: ServiceSpec): string {
  const exec = [spec.node, spec.entry, "ui", ...spec.args].map(sh).join(" ");
  return `[Unit]
Description=Garu control room and schedules (${basename(spec.root)})
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${spec.root}
Environment=PATH=${spec.path}
ExecStart=${exec}
Restart=always
RestartSec=5
StandardOutput=append:${logPath(spec.root)}
StandardError=append:${logPath(spec.root)}

[Install]
WantedBy=default.target
`;
}

/** A PATH that finds the usual tool homes even when the service starts with an empty environment. */
export function servicePath(current: string | undefined, platform: NodeJS.Platform = process.platform): string {
  const extra = platform === "darwin"
    ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", "/Applications/Docker.app/Contents/Resources/bin"]
    : ["/usr/local/bin", "/usr/bin", "/bin", join(homedir(), ".local", "bin")];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...(current ?? "").split(":"), ...extra]) {
    if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out.join(":");
}
