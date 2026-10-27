import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, fetchTools, htmlToText } from "./tools.js";

/** A fake web: answers by URL, remembers what was asked. */
function fakeWeb(routes: Record<string, { status?: number; body: string; type?: string; location?: string }>) {
  const asked: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetchFn = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, ...(init?.body ? { body: String(init.body) } : {}) });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`unexpected request ${url}`);
    const r = routes[key]!;
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "application/json", ...(r.location ? { location: r.location } : {}) } });
  }) as typeof fetch;
  return { fetchFn, asked };
}
/** The tools with a DNS that says every host is out on the open web, unless a test says otherwise. */
const tools = (o: Parameters<typeof fetchTools>[0] = {}) => fetchTools({ lookupFn: async () => ["93.184.216.34"], ...o });
const run = (def: { run: (a: never) => Promise<unknown> } | undefined, args: unknown) => def!.run(args as never) as Promise<{ isError?: boolean; content: { text: string }[] }>;

describe("fetch_json", () => {
  it("GETs the URL asking for JSON, and returns it compact", async () => {
    const web = fakeWeb({ "https://api.example.com/repo": { body: '{\n  "stars": 3,\n  "forks": 1\n}' } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/repo" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toBe('{"stars":3,"forks":1}');
    expect(web.asked[0]).toMatchObject({ method: "GET", headers: { accept: "application/json" } });
  });

  it("cuts a long answer at maxChars and says so", async () => {
    const web = fakeWeb({ "https://api.example.com/big": { body: JSON.stringify({ text: "x".repeat(500) }) } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/big", maxChars: 40 });
    expect(r.content[0]!.text).toMatch(/^.{40}\n…\[truncated to 40 chars\]$/s);
  });

  it("stops downloading an oversized body at the byte cap and says so", async () => {
    // A 3 MB answer: the tool reads a megabyte and stops; the clip to maxChars still applies on top.
    const web = fakeWeb({ "https://api.example.com/huge": { type: "text/plain", body: "y".repeat(3 * MAX_BODY_BYTES) } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://api.example.com/huge", maxChars: 50 });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]!.text).toMatch(/^y{50}\n…\[truncated to 50 chars\]\n…\[the download was stopped at 1,000,000 bytes; the page is longer than that\]$/);
    const json = await run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/huge", maxChars: 10 });
    expect(json.content[0]!.text).toContain("the download was stopped at 1,000,000 bytes");
    // A body under the cap is read whole and carries no such note.
    const small = fakeWeb({ "https://api.example.com/ok": { type: "text/plain", body: "z".repeat(1000) } });
    const s = await run(tools({ fetchFn: small.fetchFn }).fetch_text, { url: "https://api.example.com/ok" });
    expect(s.content[0]!.text).toBe("z".repeat(1000));
  });

  it("reports an error page as an error, with the start of its body", async () => {
    const web = fakeWeb({ "https://api.example.com/missing": { status: 404, body: '{"message":"Not Found"}' } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://api.example.com/missing" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain("HTTP 404");
    expect(r.content[0]!.text).toContain("Not Found");
  });

  it("refuses anything but http(s), without fetching", async () => {
    const web = fakeWeb({});
    await expect(run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "file:///etc/passwd" })).rejects.toThrow(/only http\(s\)/);
    expect(web.asked).toHaveLength(0);
  });
});

describe("fetch_text", () => {
  it("turns an HTML page into readable text", async () => {
    const web = fakeWeb({ "https://example.com/post": { type: "text/html; charset=utf-8", body: "<html><head><style>p{}</style><script>track()</script></head><body><h1>Title</h1><p>Fish &amp; chips</p></body></html>" } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://example.com/post" });
    expect(r.content[0]!.text).toBe("Title\nFish & chips");
  });

  it("returns plain text as it is", async () => {
    const web = fakeWeb({ "https://example.com/notes.txt": { type: "text/plain", body: "line one\n\n<not a tag>" } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://example.com/notes.txt" });
    expect(r.content[0]!.text).toBe("line one\n\n<not a tag>");
  });

  it("htmlToText drops scripts and styles and decodes entities", () => {
    expect(htmlToText("<script>x()</script><p>a &lt;b&gt; &quot;c&quot; &#39;d&#39;</p>")).toBe('a <b> "c" \'d\'');
  });
});

describe("post_message", () => {
  it("exists only when the server was started with a webhook", () => {
    expect(Object.keys(tools({}))).toEqual(["fetch_json", "fetch_text"]);
    expect(Object.keys(tools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }))).toEqual(["fetch_json", "fetch_text", "post_message"]);
  });

  it("takes only the text: the model can't choose where it goes", () => {
    expect(Object.keys(tools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message!.inputSchema)).toEqual(["text"]);
  });

  it("posts Slack's own formatting to Slack", async () => {
    const web = fakeWeb({ "https://hooks.slack.com/": { body: "ok" } });
    const r = await run(tools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message, { text: "# Brief\n- **one**" });
    expect(r.content[0]!.text).toBe("posted 17 chars to hooks.slack.com");
    expect(web.asked[0]).toMatchObject({ method: "POST" });
    expect(JSON.parse(web.asked[0]!.body!)).toEqual({ text: "*Brief*\n• *one*" });
  });

  it("posts Discord's shape to Discord, and plain text anywhere else", async () => {
    const web = fakeWeb({ "https://discord.com/": { body: "" }, "https://hooks.example.com/": { body: "" } });
    await run(tools({ fetchFn: web.fetchFn, webhookUrl: "https://discord.com/api/webhooks/1/x" }).post_message, { text: "hi" });
    await run(tools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.example.com/in" }).post_message, { text: "**hi**" });
    expect(JSON.parse(web.asked[0]!.body!)).toEqual({ content: "hi" });
    expect(JSON.parse(web.asked[1]!.body!)).toEqual({ text: "**hi**" });
  });

  it("reports a refused post as an error", async () => {
    const web = fakeWeb({ "https://hooks.slack.com/": { status: 403, body: "invalid_token" } });
    const r = await run(tools({ fetchFn: web.fetchFn, webhookUrl: "https://hooks.slack.com/services/T/B/X" }).post_message, { text: "hi" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toBe("webhook answered HTTP 403: invalid_token");
  });
});

describe("where fetch may go", () => {
  it("follows a redirect to another public host, checking each hop", async () => {
    const web = fakeWeb({ "https://a.example.com/old": { status: 302, location: "https://b.example.com/new", body: "" }, "https://b.example.com/new": { type: "text/plain", body: "moved here" } });
    const r = await run(tools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://a.example.com/old" });
    expect(r.content[0]!.text).toBe("moved here");
    expect(web.asked.map((a) => a.url)).toEqual(["https://a.example.com/old", "https://b.example.com/new"]);
  });

  it("refuses a redirect to this machine, and never sends that request", async () => {
    const web = fakeWeb({ "https://a.example.com/go": { status: 302, location: "http://127.0.0.1:4000/api/pair", body: "" } });
    await expect(run(tools({ fetchFn: web.fetchFn }).fetch_json, { url: "https://a.example.com/go" })).rejects.toThrow(/this machine or a private network/);
    expect(web.asked).toHaveLength(1);
  });

  it("refuses private places by name, by address, and by what a name resolves to", async () => {
    const web = fakeWeb({});
    for (const url of ["http://localhost:4000/api/pair", "http://192.168.1.5/", "http://10.0.0.1/", "http://[::1]:4000/", "http://100.100.1.2/", "http://nas.local/"]) {
      await expect(run(tools({ fetchFn: web.fetchFn }).fetch_json, { url }), url).rejects.toThrow(/private network/);
    }
    const rebinding = tools({ fetchFn: web.fetchFn, lookupFn: async () => ["127.0.0.1"] });
    await expect(run(rebinding.fetch_json, { url: "https://evil.example.com/" })).rejects.toThrow(/private network/);
    expect(web.asked).toHaveLength(0);
  });

  it("gives up after too many redirects", async () => {
    const web = fakeWeb({ "https://loop.example.com/": { status: 302, location: "https://loop.example.com/", body: "" } });
    await expect(run(tools({ fetchFn: web.fetchFn }).fetch_text, { url: "https://loop.example.com/" })).rejects.toThrow(/too many redirects/);
  });

  it("a webhook travels encrypted, unless it stays on your own network", () => {
    expect(() => fetchTools({ webhookUrl: "http://hooks.example.com/x" })).toThrow(/https/);
    expect(Object.keys(fetchTools({ webhookUrl: "http://192.168.1.20:8080/garu" }))).toContain("post_message");
    expect(Object.keys(fetchTools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" }))).toContain("post_message");
  });
});

describe("annotations", () => {
  it("say the reads only read and the post changes something, and nothing is destructive", () => {
    const t = tools({ webhookUrl: "https://hooks.slack.com/services/T/B/X" });
    expect(t.fetch_json!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(t.fetch_text!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(t.post_message!.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    for (const def of Object.values(t)) expect(def.annotations.destructiveHint).toBe(false);
  });
});
