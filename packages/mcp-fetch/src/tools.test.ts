import { describe, expect, it } from "vitest";
import { fetchTools, htmlToText } from "./tools.js";

/** A fake web: answers by URL, remembers what was asked. */
function fakeWeb(routes: Record<string, { status?: number; body: string; type?: string }>) {
  const asked: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, ...(init?.body ? { body: String(init.body) } : {}) });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected request ${url}`);
    const r = routes[key]!;
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "application/json" } });
  }) as typeof fetch;
  return { fetchFn, asked };
}
const run = (def: { run: (a: never) => Promise<unknown> } | undefined, args: unknown) => def!.run(args as never) as Promise<{ isError?: boolean; content: { text: string }[] }>;

describe("fetch_json", () => {
  it("GETs the URL asking for JSON, and returns it compact", async () => {
    const web = fakeWeb({ "https://api.example.com/repo": { body: '{\n  "stars": 3,\n  "forks": 1\n}' } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/repo" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toBe('{"stars":3,"forks":1}');
    expect(web.asked[0]).toMatchObject({ method: "GET", headers: { accept: "application/json" } });
  });

  it("cuts a long answer at maxChars and says so", async () => {
    const web = fakeWeb({ "https://api.example.com/big": { body: JSON.stringify({ text: "x".repeat(500) }) } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/big", maxChars: 40 });
    expect(r.content[0]!.text).toMatch(/^.{40}\n…\[truncated to 40 chars\]$/s);
  });

  it("reports an error page as an error, with the start of its body", async () => {
    const web = fakeWeb({ "https://api.example.com/missing": { status: 404, body: '{"message":"Not Found"}' } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/missing" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("HTTP 404");
    expect(r.content[0]!.text).toContain("Not Found");
  });

  it("refuses anything but http(s), without fetching", async () => {
    const web = fakeWeb({});
    await expect(run(fetchTools({ fetchFn: web.fetchFn }).fetch_json, { url: "file:///etc/passwd" })).rejects.toThrow(/only http\(s\)/);
    expect(web.asked).toHaveLength(0);
  });
});

describe("fetch_text", () => {
  it("turns an HTML page into readable text", async () => {
    const web = fakeWeb({ "https://example.com/post": { type: "text/html; charset=utf-8", body: "<html><head><style>p{}</style><script>track()</script></head><body><h1>Title</h1><p>Fish &amp; chips</p></body></html>" } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://example.com/post" });
    expect(r.content[0]!.text).toBe("Title\nFish & chips");
  });

  it("returns plain text as it is", async () => {
    const web = fakeWeb({ "https://example.com/notes.txt": { type: "text/plain", body: "line one\n\n<not a tag>" } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://example.com/notes.txt" });
    expect(r.content[0]!.text).toBe("line one\n\n<not a tag>");
  });

  it("htmlToText drops scripts and styles and decodes entities", () => {
    expect(htmlToText("<script>x()</script><p>a &lt;b&gt; &quot;c&quot; &#39;d&#39;</p>")).toBe('a <b> "c" \'d\'');
  });
});

describe("post_message", () => {
  it("exists only when the server was started with a webhook", () => {
    expect(Object.keys(fetchTools({}))).toEqual(["fetch_json", "fetch_text"]);
    expect(Object.keys(fetchTools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }))).toEqual(["fetch_json", "fetch_text", "post_message"]);
  });

  it("takes only the text: the model can't choose where it goes", () => {
    expect(Object.keys(fetchTools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message!.inputSchema)).toEqual(["text"]);
  });

  it("posts Slack's own formatting to Slack", async () => {
    const web = fakeWeb({ "https://hooks.slack.com/": { body: "ok" } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message, { text: "# Brief\n- **one**" });
    expect(r.content[0]!.text).toBe("posted 17 chars to hooks.slack.com");
    expect(web.asked[0]).toMatchObject({ method: "POST" });
    expect(JSON.parse(web.asked[0]!.body!)).toEqual({ text: "*Brief*\n• *one*" });
  });

  it("posts Discord's shape to Discord, and plain text anywhere else", async () => {
    const web = fakeWeb({ "https://discord.com/": { body: "" }, "https://hooks.example.com/": { body: "" } });
    await run(fetchTools({ fetchFn: web.fetchFn, webhookUrl: "https://discord.com/api/webhooks/1/x" }).post_message, { text: "hi" });
    await run(fetchTools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.example.com/in" }).post_message, { text: "**hi**" });
    expect(JSON.parse(web.asked[0]!.body!)).toEqual({ content: "hi" });
    expect(JSON.parse(web.asked[1]!.body!)).toEqual({ text: "**hi**" });
  });

  it("reports a refused post as an error", async () => {
    const web = fakeWeb({ "https://hooks.slack.com/": { status: 403, body: "invalid_token" } });
    const r = await run(fetchTools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message, { text: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toBe("webhook answered HTTP 403: invalid_token");
  });
});

describe("annotations", () => {
  it("say the reads only read and the post changes something, and nothing is destructive", () => {
    const t = fetchTools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" });
    expect(t.fetch_json!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(t.fetch_text!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(t.post_message!.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    for (const def of Object.values(t)) expect(def.annotations.destructiveHint).toBe(false);
  });
});
