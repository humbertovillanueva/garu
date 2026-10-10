/**
 * The tools, named as Google's own MCP servers name them, so a Garufile's policy reads the same
 * either way. What's missing is deliberate: there is no send, delete, trash, unlabel or
 * calendar-write tool, so no policy mistake can reach one.
 */
import { z } from "zod";
import {
  CALENDAR,
  GMAIL,
  buildDraft,
  checkUserLabels,
  eventView,
  header,
  mapLimit,
  messageView,
  threadSummary,
  type Call,
  type CalendarEvent,
  type GmailLabel,
  type GmailThread,
} from "./google.js";

export interface ToolDef {
  description: string;
  inputSchema: z.ZodRawShape;
  run: (args: never) => Promise<unknown>;
}

function tool<S extends z.ZodRawShape>(description: string, inputSchema: S, run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>): ToolDef {
  return { description, inputSchema, run: run as (args: never) => Promise<unknown> };
}

const q = (params: Record<string, string | number | boolean | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  return u.toString();
};
const instant = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "an RFC 3339 date-time with offset, e.g. 2026-10-12T00:00:00-06:00");

export function calendarTools(call: Call): Record<string, ToolDef> {
  return {
    list_calendars: tool("List the calendars you can see: your own and the ones shared with you. Returns each one's id, name and time zone.", {}, async () => {
      const r = await call<{ items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; timeZone?: string; accessRole?: string; hidden?: boolean }[] }>(
        `${CALENDAR}/users/me/calendarList?${q({ minAccessRole: "reader", maxResults: 250 })}`,
      );
      return (r.items ?? []).filter((c) => !c.hidden).map((c) => ({
        id: c.id,
        name: c.summaryOverride ?? c.summary ?? c.id,
        ...(c.primary ? { primary: true } : {}),
        ...(c.timeZone ? { timeZone: c.timeZone } : {}),
        ...(c.accessRole ? { access: c.accessRole } : {}),
      }));
    }),

    list_events: tool(
      "List events on one calendar between two times, in order, with repeating events expanded. Returns title, start, end, location, attendees and video link.",
      {
        calendarId: z.string().default("primary").describe('"primary" for your main calendar, or an id from list_calendars'),
        timeMin: instant.describe("start of the window, e.g. 2026-10-12T00:00:00-06:00"),
        timeMax: instant.describe("end of the window, e.g. 2026-10-13T00:00:00-06:00"),
        query: z.string().optional().describe("only events matching this text"),
        maxResults: z.number().int().min(1).max(250).default(50),
      },
      async ({ calendarId, timeMin, timeMax, query, maxResults }) => {
        const r = await call<{ timeZone?: string; items?: CalendarEvent[] }>(
          `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events?${q({ timeMin, timeMax, q: query, maxResults, singleEvents: true, orderBy: "startTime" })}`,
        );
        return { calendarId, ...(r.timeZone ? { timeZone: r.timeZone } : {}), events: (r.items ?? []).filter((e) => e.status !== "cancelled").map((e) => eventView(e, 400)) };
      },
    ),

    get_event: tool(
      "Get one event in full, including its whole description.",
      { calendarId: z.string().default("primary"), eventId: z.string().min(1) },
      async ({ calendarId, eventId }) => eventView(await call<CalendarEvent>(`${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`), 4000),
    ),
  };
}

export function gmailTools(call: Call): Record<string, ToolDef> {
  const labels = async () => (await call<{ labels?: GmailLabel[] }>(`${GMAIL}/labels`)).labels ?? [];

  return {
    search_threads: tool(
      "Search your mail with Gmail search syntax (from:, to:, newer_than:2d, in:inbox, -label:x, …). Returns each thread's id, subject, last sender, date, labels and a snippet.",
      { query: z.string().min(1), maxResults: z.number().int().min(1).max(50).default(20) },
      async ({ query, maxResults }) => {
        const r = await call<{ threads?: { id: string }[]; resultSizeEstimate?: number }>(`${GMAIL}/threads?${q({ q: query, maxResults })}`);
        const ids = (r.threads ?? []).map((t) => t.id);
        const threads = await mapLimit(ids, 5, (id) =>
          call<GmailThread>(`${GMAIL}/threads/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),
        );
        return { threads: threads.map(threadSummary), ...(ids.length === maxResults ? { more: "there may be more; narrow the query" } : {}) };
      },
    ),

    get_thread: tool(
      "Read a thread: every message's sender, recipients, date, subject, attachment names and text (quoted history removed, long messages cut).",
      { threadId: z.string().min(1), maxCharsPerMessage: z.number().int().min(200).max(20_000).default(3000) },
      async ({ threadId, maxCharsPerMessage }) => {
        const t = await call<GmailThread>(`${GMAIL}/threads/${encodeURIComponent(threadId)}?format=full`);
        const msgs = t.messages ?? [];
        return { id: t.id, subject: header(msgs[0]?.payload, "Subject") ?? "", labels: [...new Set(msgs.flatMap((m) => m.labelIds ?? []))], messages: msgs.map((m) => messageView(m, maxCharsPerMessage)) };
      },
    ),

    list_labels: tool("List your Gmail labels with their ids. Your own labels have type \"user\".", {}, async () =>
      (await labels()).map((l) => ({ id: l.id, name: l.name, type: l.type ?? "user" })),
    ),

    list_drafts: tool("List your drafts: each one's id, thread, recipients and subject.", { maxResults: z.number().int().min(1).max(50).default(20) }, async ({ maxResults }) => {
      const r = await call<{ drafts?: { id: string }[] }>(`${GMAIL}/drafts?${q({ maxResults })}`);
      return mapLimit(r.drafts ?? [], 5, async (d) => {
        const full = await call<{ id: string; message?: { threadId?: string; payload?: Parameters<typeof header>[0] } }>(`${GMAIL}/drafts/${encodeURIComponent(d.id)}?format=metadata`);
        return { id: full.id, threadId: full.message?.threadId ?? "", to: header(full.message?.payload, "To") ?? "", subject: header(full.message?.payload, "Subject") ?? "" };
      });
    }),

    label_thread: tool(
      "File threads under one or more of your own labels (ids from list_labels). Pass every thread that goes under the same label in one call. It only adds labels; it can't remove any, and Gmail's system labels (Inbox, Spam, Trash…) are refused.",
      { threadIds: z.array(z.string().min(1)).min(1).max(50), labelIds: z.array(z.string().min(1)).min(1).max(5) },
      async ({ threadIds, labelIds }) => {
        const chosen = checkUserLabels(labelIds, await labels());
        const ids = [...new Set(threadIds)];
        // One thread that fails (deleted meanwhile, say) doesn't stop the rest; it's named in the answer.
        const results = await mapLimit(ids, 5, (id) =>
          call(`${GMAIL}/threads/${encodeURIComponent(id)}/modify`, { method: "POST", body: { addLabelIds: chosen.map((l) => l.id) } }).then(
            () => null,
            (e: Error) => ({ threadId: id, error: e.message }),
          ),
        );
        const failed = results.filter((r): r is { threadId: string; error: string } => r !== null);
        return { added: chosen.map((l) => l.name), filed: ids.length - failed.length, ...(failed.length ? { failed } : {}) };
      },
    ),

    create_draft: tool(
      "Save a plain-text email as a draft in Gmail. It is not sent: it waits in Drafts. For a reply, pass the threadId and write to and subject as they should appear (usually the sender and \"Re: <subject>\").",
      {
        to: z.array(z.string().min(3)).min(1).max(20).describe('one address per entry: "a@b.com" or "Name <a@b.com>"'),
        cc: z.array(z.string().min(3)).max(20).optional(),
        subject: z.string().min(1).max(250),
        body: z.string().min(1).max(20_000),
        threadId: z.string().optional().describe("the thread this replies to"),
      },
      async ({ to, cc, subject, body, threadId }) => {
        let inReplyTo: string | undefined;
        let references: string | undefined;
        if (threadId) {
          const t = await call<GmailThread>(`${GMAIL}/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
          const last = t.messages?.at(-1)?.payload;
          inReplyTo = header(last, "Message-ID");
          references = [header(last, "References"), inReplyTo].filter(Boolean).join(" ") || undefined;
        }
        const raw = buildDraft({ to, cc, subject, body, inReplyTo, references });
        const d = await call<{ id: string; message?: { threadId?: string } }>(`${GMAIL}/drafts`, { method: "POST", body: { message: { raw, ...(threadId ? { threadId } : {}) } } });
        return { draftId: d.id, threadId: d.message?.threadId ?? threadId ?? "", to, ...(cc?.length ? { cc } : {}), subject, saved: "in Drafts, not sent" };
      },
    ),
  };
}
