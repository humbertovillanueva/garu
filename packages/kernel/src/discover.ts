/**
 * Find Garufiles under a directory so the control room (and `garu up` with no
 * arguments) can work with every agent in a project without being told.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseGarufile, type Garufile } from "./garufile.js";

export interface DiscoveredAgent {
  /** Path relative to the root it was discovered from. */
  source: string;
  path: string;
  garufile: Garufile;
}

export interface DiscoverProblem {
  source: string;
  error: string;
}

const SKIP = new Set(["node_modules", ".git", ".garu", "dist", "build", "coverage", ".next", ".svelte-kit"]);
const NAMES = new Set(["Garufile.yaml", "Garufile.yml", "garufile.yaml", "garufile.yml"]);

export function discoverGarufiles(root: string, maxDepth = 4): { agents: DiscoveredAgent[]; problems: DiscoverProblem[] } {
  const agents: DiscoveredAgent[] = [];
  const problems: DiscoverProblem[] = [];
  const seen = new Set<string>();

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || !existsSync(dir)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort(); // deterministic: "first one found wins" must mean the same thing on every machine
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP.has(name) && !name.startsWith(".")) walk(full, depth + 1);
      } else if (NAMES.has(name)) {
        const source = relative(root, full) || name;
        try {
          const g = parseGarufile(readFileSync(full, "utf8"), source);
          if (seen.has(g.name)) {
            problems.push({ source, error: `duplicate agent name "${g.name}"; the first one found wins` });
            continue;
          }
          seen.add(g.name);
          agents.push({ source, path: full, garufile: g });
        } catch (e) {
          problems.push({ source, error: (e as Error).message });
        }
      }
    }
  };
  walk(root, 0);
  agents.sort((a, b) => a.garufile.name.localeCompare(b.garufile.name));
  return { agents, problems };
}
