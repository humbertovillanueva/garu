import { describe, expect, it } from "vitest";
import { GMAIL, bodyText, buildDraft, checkAddresses, checkUserLabels, eventView, googleClient, stripQuoted, type Call } from "./google.js";
import { calendarTools, gmailTools } from "./tools.js";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unraw = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("reading mail", () => {
  it("prefers the plain-text part, skips attachments, falls back to the HTML as text", () => {
    const alt = { mimeType: "multipart/mixed", parts: [
      { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("Hi Humberto,\r\nSee you at 3.") } }, { mimeType: "text/html", body: { data: b64("<p>Hi</p>") } }] },
      { mimeType: "text/plain", filename: "notes.txt", body: { data: b64("attachment text") } },
    ] };
    expect(bodyText(alt)).toBe("Hi Humberto,\nSee you at 3.");
    expect(bodyText({ mimeType: "text/html", body: { data: b64("<div>Total: <b>$12</b></div><br>Thanks &amp; bye<style>p{}</style>") } })).toBe("Total: $12\n\nThanks & bye");
  });

  it("drops the quoted history under a reply", () => {
    expect(stripQuoted("Sounds good.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Ana <ana@x.com> wrote:\n> Can we meet?\n> Tuesday?")).toBe("Sounds good.");
    expect(stripQuoted("Yes\n> quoted\nmore")).toBe("Yes\nmore");
  });
});

describe("drafts", () => {
  it("builds a reply that threads, with a UTF-8 subject and body", () => {
    const raw = unraw(buildDraft({ to: ["Ana López <ana@example.com>"], subject: "Re: Reunión", body: "¡Hola!\nNos vemos.", inReplyTo: "<m1@x>", references: "<m0@x> <m1@x>" }));
    const [head, body] = raw.split("\r\n\r\n");
    expect(head).toContain("To: =?UTF-8?B?");
    expect(head).toContain("<ana@example.com>");
    expect(head).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
    expect(head).toContain("In-Reply-To: <m1@x>");
    expect(head).toContain("References: <m0@x> <m1@x>");
    expect(Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("¡Hola!\r\nNos vemos.");
  });

  it("refuses anything that would smuggle in another header or recipient", () => {
    expect(() => buildDraft({ to: ["a@b.com"], subject: "hi\r\nBcc: evil@x.com", body: "x" })).toThrow(/line break/);
    expect(() => checkAddresses(["a@b.com, evil@x.com"], "to")).toThrow(/isn't one email address/);
    expect(() => checkAddresses(["a@b.com\nBcc: evil@x.com"], "to")).toThrow();
    expect(checkAddresses([" Ana <ana@b.com> ", "bo@c.org"], "to")).toEqual(["Ana <ana@b.com>", "bo@c.org"]);
  });
});

describe("labels", () => {
  const labels = [{ id: "INBOX", name: "INBOX", type: "system" }, { id: "TRASH", name: "TRASH", type: "system" }, { id: "Label_1", name: "Garu/FYI", type: "user" }];
  it("adds only your own labels", () => {
    expect(checkUserLabels(["Label_1"], labels).map((l) => l.name)).toEqual(["Garu/FYI"]);
    expect(() => checkUserLabels(["TRASH"], labels)).toThrow(/system label/);
    expect(() => checkUserLabels(["Label_9"], labels)).toThrow(/no label/);
  });
});

describe("calendar", () => {
  it("keeps what a prep note needs and drops meeting rooms", () => {
    const v = eventView({
      id: "e1", summary: "Planning", start: { dateTime: "2026-10-12T10:00:00-06:00" }, end: { dateTime: "2026-10-12T10:30:00-06:00" },
      attendees: [{ email: "me@x.com", self: true, responseStatus: "accepted" }, { email: "ana@x.com", displayName: "Ana" }, { email: "room@resource.calendar.google.com", resource: true }],
      hangoutLink: "https://meet.google.com/abc", description: "<b>Agenda</b><br>1. Budget",
    }, 400);
    expect(v).toMatchObject({ title: "Planning", start: "2026-10-12T10:00:00-06:00", video: "https://meet.google.com/abc", description: "Agenda\n1. Budget" });
    expect(v.attendees).toEqual([{ email: "me@x.com", response: "accepted", you: true }, { email: "ana@x.com", name: "Ana" }]);
    expect(eventView({ id: "e2", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } }, 400)).toMatchObject({ allDay: true, title: "(no title)" });
  });
});

/** A fake Google: answers by URL, remembers what was asked. */
function fakeGoogle(routes: Record<string, unknown>): { call: Call; asked: { url: string; method: string; body?: unknown }[] } {
  const asked: { url: string; method: string; body?: unknown }[] = [];
  const call = (async (url: string, init?: { method?: string; body?: unknown }) => {
    asked.push({ url, method: init?.method ?? "GET", ...(init?.body !== undefined ? { body: init.body } : {}) });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected request ${url}`);
    return routes[key];
  }) as Call;
  return { call, asked };
}
const run = (def: { run: (a: never) => Promise<unknown> }, args: unknown) => def.run(args as never);

describe("tools", () => {
  it("list_events asks for one window, repeating events expanded, in order", async () => {
    const g = fakeGoogle({ "/events?": { timeZone: "America/Denver", items: [{ id: "a", summary: "Standup", status: "confirmed", start: { dateTime: "2026-10-12T09:00:00-06:00" } }, { id: "b", status: "cancelled" }] } });
    const r = (await run(calendarTools(g.call).list_events!, { calendarId: "primary", timeMin: "2026-10-12T00:00:00-06:00", timeMax: "2026-10-13T00:00:00-06:00", maxResults: 50 })) as { events: unknown[] };
    expect(r.events).toHaveLength(1);
    const u = new URL(g.asked[0]!.url);
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("orderBy")).toBe("startTime");
    expect(u.searchParams.get("timeMin")).toBe("2026-10-12T00:00:00-06:00");
  });

  it("search_threads returns one line per thread", async () => {
    const g = fakeGoogle({
      "/threads?": { threads: [{ id: "t1" }] },
      "/threads/t1?format=metadata": { id: "t1", messages: [
        { id: "m1", threadId: "t1", labelIds: ["INBOX"], payload: { headers: [{ name: "Subject", value: "Lunch?" }, { name: "From", value: "Ana <ana@x.com>" }] } },
        { id: "m2", threadId: "t1", labelIds: ["INBOX", "UNREAD"], snippet: "Tuesday works &amp; Wednesday", payload: { headers: [{ name: "From", value: "Bo <bo@x.com>" }, { name: "Date", value: "Mon, 12 Oct 2026" }] } },
      ] },
    });
    const r = (await run(gmailTools(g.call).search_threads!, { query: "newer_than:1d", maxResults: 20 })) as { threads: unknown[] };
    expect(r.threads).toEqual([{ id: "t1", subject: "Lunch?", from: "Bo <bo@x.com>", date: "Mon, 12 Oct 2026", messages: 2, labels: ["INBOX", "UNREAD"], snippet: "Tuesday works & Wednesday" }]);
  });

  it("label_thread won't touch a system label, and asks Google for nothing but adding", async () => {
    const g = fakeGoogle({ "/labels": { labels: [{ id: "SPAM", name: "SPAM", type: "system" }, { id: "Label_2", name: "Garu/Receipts", type: "user" }] }, "/modify": {} });
    await expect(run(gmailTools(g.call).label_thread!, { threadIds: ["t1"], labelIds: ["SPAM"] })).rejects.toThrow(/system label/);
    expect(g.asked.some((a) => a.url.includes("/modify"))).toBe(false);
    expect(await run(gmailTools(g.call).label_thread!, { threadIds: ["t1"], labelIds: ["Label_2"] })).toEqual({ added: ["Garu/Receipts"], filed: 1 });
    expect(g.asked.at(-1)).toEqual({ url: `${GMAIL}/threads/t1/modify`, method: "POST", body: { addLabelIds: ["Label_2"] } });
  });

  it("label_thread files a batch in one call, and names any thread that failed", async () => {
    const asked: string[] = [];
    const call = (async (url: string) => {
      asked.push(url);
      if (url.endsWith("/labels")) return { labels: [{ id: "Label_3", name: "Garu/Newsletters", type: "user" }] };
      if (url.includes("/threads/gone/")) throw new Error("not found (Requested entity was not found.)");
      return {};
    }) as Call;
    const r = await run(gmailTools(call).label_thread!, { threadIds: ["a", "b", "gone", "a"], labelIds: ["Label_3"] });
    expect(r).toEqual({ added: ["Garu/Newsletters"], filed: 2, failed: [{ threadId: "gone", error: "not found (Requested entity was not found.)" }] });
    expect(asked.filter((u) => u.endsWith("/modify")).sort()).toEqual([`${GMAIL}/threads/a/modify`, `${GMAIL}/threads/b/modify`, `${GMAIL}/threads/gone/modify`]);
  });

  it("create_draft saves a reply in the thread, and says it wasn't sent", async () => {
    const g = fakeGoogle({
      "/threads/t1?format=metadata": { id: "t1", messages: [{ id: "m1", threadId: "t1", payload: { headers: [{ name: "Message-Id", value: "<abc@mail>" }] } }] },
      "/drafts": { id: "d1", message: { threadId: "t1" } },
    });
    const r = await run(gmailTools(g.call).create_draft!, { to: ["ana@x.com"], subject: "Re: Lunch?", body: "Tuesday works.", threadId: "t1" });
    expect(r).toMatchObject({ draftId: "d1", threadId: "t1", saved: "in Drafts, not sent" });
    const post = g.asked.at(-1)!;
    expect(post.url).toBe(`${GMAIL}/drafts`);
    const msg = (post.body as { message: { raw: string; threadId: string } }).message;
    expect(msg.threadId).toBe("t1");
    expect(unraw(msg.raw)).toContain("In-Reply-To: <abc@mail>");
  });

  it("labels every tool: reads only read, filing and drafting change something, nothing is destructive", () => {
    const all = { ...calendarTools(fakeGoogle({}).call), ...gmailTools(fakeGoogle({}).call) };
    expect(Object.keys(all)).toHaveLength(9);
    for (const [name, def] of Object.entries(all)) {
      expect(def.annotations, name).toBeDefined();
      expect(def.annotations!.destructiveHint, name).toBe(false);
      expect(def.annotations!.openWorldHint, name).toBe(false);
      expect(def.annotations!.readOnlyHint, name).toBe(!["label_thread", "create_draft"].includes(name));
    }
  });

  it("has no tool that sends, deletes or changes the calendar", () => {
    const names = [...Object.keys(gmailTools(fakeGoogle({}).call)), ...Object.keys(calendarTools(fakeGoogle({}).call))];
    expect(names.filter((n) => /send|delete|trash|remove|update|create_event|modify/.test(n))).toEqual([]);
  });
});

describe("googleClient", () => {
  it("without a token, says it needs a sign-in and doesn't call Google", async () => {
    let called = false;
    const call = googleClient(undefined, (async () => { called = true; return new Response("{}"); }) as typeof fetch);
    await expect(call(`${GMAIL}/labels`)).rejects.toThrow(/not signed in/);
    expect(called).toBe(false);
  });

  it("explains a refused sign-in in plain words", async () => {
    const call = googleClient("t", (async () => new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), { status: 401 })) as typeof fetch);
    await expect(call(`${GMAIL}/labels`)).rejects.toThrow(/signing in again/);
  });
});
