/**
 * Sandbox — run each MCP tool server inside its own Docker container.
 *
 * The model is not the dangerous part of an agent; the tools are. So the
 * container boundary goes around the tool servers: no network unless asked,
 * only the agent's workspace mounted, memory and CPU capped, gone when the
 * run ends. The agent loop and the policy kernel stay on the host, in front.
 */
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { McpServerSpec, Sandbox } from "./garufile.js";

export const DEFAULT_SANDBOX_IMAGE = "garu-sandbox";
export const WORKSPACE_MOUNT = "/workspace";

export interface SandboxedCommand {
  command: "docker";
  args: string[];
  /** Container name, so we can force-remove it on shutdown. */
  containerName: string;
}

/** Build the `docker run` invocation for one tool server. Pure: easy to test, no Docker needed. */
export function dockerArgs(spec: McpServerSpec, sandbox: Sandbox, agent: string, cwd = process.cwd()): SandboxedCommand {
  const containerName = `garu-${safe(agent)}-${safe(spec.name)}-${randomUUID().slice(0, 8)}`;
  const args: string[] = [
    "run",
    "--rm", // remove when the server exits
    "-i", // stdio transport
    "--init", // reap zombies, forward signals
    "--name", containerName,
    "--network", sandbox.network,
    "--memory", sandbox.memory,
    "--cpus", String(sandbox.cpus),
    "--cap-drop", "ALL", // no Linux capabilities at all
    "--security-opt", "no-new-privileges",
    "--read-only", // root filesystem is immutable; only mounts are writable
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--workdir", WORKSPACE_MOUNT,
  ];
  if (sandbox.workspace) {
    args.push("-v", `${resolve(cwd, sandbox.workspace)}:${WORKSPACE_MOUNT}:rw`);
  }
  for (const m of sandbox.mounts) {
    args.push("-v", `${resolve(cwd, m.host)}:${m.container}:${m.readonly ? "ro" : "rw"}`);
  }
  for (const [k, v] of Object.entries(spec.env)) {
    args.push("-e", `${k}=${v}`);
  }
  args.push(sandbox.image, spec.command, ...spec.args);
  return { command: "docker", args, containerName };
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 40);
}

/** Turn a Docker spawn failure into advice a person can act on. */
export function explainDockerError(message: string, image: string): string {
  if (/ENOENT|not found|No such file/i.test(message) && /docker/i.test(message)) {
    return `Docker isn't installed or not on PATH. Install Docker Desktop (https://docker.com) and try again.`;
  }
  if (/Cannot connect to the Docker daemon|docker.sock|daemon is not running/i.test(message)) {
    return `Docker is installed but not running. Start Docker Desktop and try again.`;
  }
  if (/Unable to find image|pull access denied|No such image/i.test(message)) {
    return `the sandbox image "${image}" doesn't exist yet. Build it with: garu sandbox build`;
  }
  return message;
}
