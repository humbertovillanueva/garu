/** Hash router: "#/runs/hello/2026…" → { name: "runs", parts: ["hello", "2026…"] }. No dependency needed. */
export const route = $state({ name: "home", parts: [] as string[] });

function parse(): void {
  const hash = location.hash.replace(/^#\/?/, "");
  const [name = "home", ...parts] = hash.split("/").map(decodeURIComponent);
  route.name = name || "home";
  route.parts = parts;
}

export function startRouter(): void {
  parse();
  addEventListener("hashchange", parse);
}

export function href(...segments: string[]): string {
  return "#/" + segments.map(encodeURIComponent).join("/");
}
