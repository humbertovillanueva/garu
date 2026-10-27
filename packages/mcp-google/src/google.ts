/**
 * Talking to Google, and turning what comes back into something short a model can read.
 *
 * Nothing here decides what an agent may do: the Garufile policy does. This file only makes
 * sure each request is what it says it is (an address is one address, a label is one of yours)
 * and keeps answers small: plain text, quoted replies dropped, long bodies clipped.
 */

export const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const CALENDAR = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 20_000;

export class GoogleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GoogleError";
  }
}

/** One authenticated request to a Google API; JSON in, JSON out. */
export type Call = <T = unknown>(url: string, init?: { method?: "GET" | "POST"; body?: unknown }) => Promise<T>;

export function googleClient(token: string | undefined, fetchFn: typeof fetch = fetch): Call {
  return async <T>(url: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> => {
    if (!token) throw new GoogleError(401, "not signed in to Google yet: it needs a sign-in on the computer running Garu");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(url, {
        method: init.method ?? "GET",
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      const text = await res.text();
      if (!res.ok) throw new GoogleError(res.status, explain(res.status, text));
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new GoogleError(0, `no answer from Google within ${Math.round(TIMEOUT_MS / 1000)} s`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

function explain(status: number, body: string): string {
  let msg = body.slice(0, 300);
  try {
    msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? msg;
  } catch {
    /* not JSON */
  }
  if (status === 401) return "Google refused the access token (over an hour old, or the sign-in was removed). Garu renews it and tries once more; if that fails too, sign in again on the computer running Garu";
  if (status === 403 && /insufficient|scope|permission/i.test(msg)) return `this sign-in doesn't include permission for that (${msg})`;
  if (status === 404) return `not found (${msg})`;
  return `Google answered ${status}: ${msg}`;
}

// ---------- text ----------

export function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…[cut at ${max} characters]` : s;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Very small HTML → text: drop scripts, styles and tags; keep paragraph breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop the quoted history under a reply ("On … wrote:" and "> " lines): the thread already has it. */
export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .{4,200}wrote:\s*$/.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim())) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Gmail messages ----------

export interface GmailHeader { name: string; value: string }
export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
export interface GmailMessage { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart }
export interface GmailThread { id: string; snippet?: string; messages?: GmailMessage[] }

export function header(part: GmailPart | undefined, name: string): string | undefined {
  const n = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === n)?.value;
}

/**
 * Mail no one reads a reply to. The address says so itself (noreply@, notifications@, a
 * "notification." subdomain, a newsletter; in Spanish no-responder@, notificaciones@, avisos@,
 * boletin@), or the headers do: sent automatically, bulk, a mailing list. A draft reply to any
 * of these goes nowhere, so the tools refuse to write one.
 */
export const AUTOMATED_ADDRESS = /(?:^|[.\-_+@<])(?:no-?reply|do-?not-?reply|donotreply|no-?responder|no-?contestar|notifications?|notificaciones|notify|alerts?|alertas?|avisos?|mailer-daemon|postmaster|bounces?|auto(?:mated|matic|mailer)?|automatic[oa]|newsletters?|boletin(?:es)?|novedades|digest|updates?|news|marketing|promociones?|unsubscribe)(?:[.\-_+@>]|$)/i;

export function looksAutomated(address: string): boolean {
  return AUTOMATED_ADDRESS.test(address.trim());
}

const bareAddress = (v: string) => /<([^>]+)>/.exec(v)?.[1] ?? v.trim();

/** Why this message can't be replied to, in words, or null when a person might read a reply. */
export function automatedSender(part: GmailPart | undefined): string | null {
  const auto = header(part, "Auto-Submitted");
  if (auto && !/^no\b/i.test(auto.trim())) return "it was sent automatically (Auto-Submitted)";
  const prec = header(part, "Precedence")?.trim();
  if (prec && /^(bulk|list|junk|auto_reply)$/i.test(prec)) return `it's bulk mail (Precedence: ${prec})`;
  if (header(part, "List-Unsubscribe") || header(part, "List-Id")) return "it's a mailing list (List-Unsubscribe)";
  for (const name of ["Reply-To", "From"]) {
    const v = header(part, name);
    if (v && looksAutomated(v)) return `${bareAddress(v)} is an address no one reads`;
  }
  return null;
}

/** A model sometimes writes "\n" as two characters. A body with those and no real line breaks meant them as breaks. */
export function unescapeBreaks(text: string): string {
  return !text.includes("\n") && text.includes("\\n") ? text.replace(/\\r\\n|\\n/g, "\n") : text;
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

/** The readable body of a message: its text/plain part, else its HTML as text. Attachments are skipped. */
export function bodyText(part: GmailPart | undefined): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename) return; // an attachment, even if it's text
    if (p.body?.data && p.mimeType === "text/plain") plain.push(decode(p.body.data));
    else if (p.body?.data && p.mimeType === "text/html") html.push(decode(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plain.length) return plain.join("\n").replace(/\r\n/g, "\n").trim();
  return html.map(htmlToText).join("\n").trim();
}

export function attachmentNames(part: GmailPart | undefined): string[] {
  const out: string[] = [];
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.filename) out.push(p.filename);
    p.parts?.forEach(walk);
  };
  walk(part);
  return out;
}

export function messageView(m: GmailMessage, maxChars: number) {
  const files = attachmentNames(m.payload);
  const automated = automatedSender(m.payload);
  return {
    id: m.id,
    from: header(m.payload, "From") ?? "",
    ...(automated ? { automated } : {}),
    to: header(m.payload, "To") ?? "",
    ...(header(m.payload, "Cc") ? { cc: header(m.payload, "Cc") } : {}),
    date: header(m.payload, "Date") ?? "",
    subject: header(m.payload, "Subject") ?? "",
    ...(files.length ? { attachments: files } : {}),
    text: clip(stripQuoted(bodyText(m.payload)), maxChars),
  };
}

/** One line's worth of a thread, from its metadata: who wrote last, about what, when. */
export function threadSummary(t: GmailThread) {
  const msgs = t.messages ?? [];
  const last = msgs.at(-1);
  const labels = [...new Set(msgs.flatMap((m) => m.labelIds ?? []))];
  const automated = automatedSender(last?.payload);
  return {
    id: t.id,
    subject: header(msgs[0]?.payload, "Subject") ?? "",
    from: header(last?.payload, "From") ?? "",
    ...(automated ? { automated } : {}),
    date: header(last?.payload, "Date") ?? "",
    messages: msgs.length,
    labels,
    snippet: decodeEntities(last?.snippet ?? t.snippet ?? ""),
  };
}

// ---------- drafts ----------

const ADDRESS = /^(?:[^\r\n<>@,;"]*|"[^\r\n"]*")\s*<[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+>$|^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

/** One address per entry ("a@b.com" or "Name <a@b.com>"): no line breaks, no lists hiding in one entry. */
export function checkAddresses(list: readonly string[], field: string): string[] {
  return list.map((raw) => {
    const a = raw.trim();
    if (!ADDRESS.test(a)) throw new Error(`${field}: "${raw.slice(0, 80)}" isn't one email address`);
    return a;
  });
}

/** A header value with no line breaks; non-ASCII as RFC 2047 so it survives every mail system. */
export function encodeHeader(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("a header can't contain a line break");
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export interface DraftInput { to: string[]; cc?: string[] | undefined; subject: string; body: string; inReplyTo?: string | undefined; references?: string | undefined }

/** The raw RFC 2822 message Gmail stores as a draft, base64url-encoded. Plain text, UTF-8. */
export function buildDraft(d: DraftInput): string {
  const to = checkAddresses(d.to, "to");
  const cc = checkAddresses(d.cc ?? [], "cc");
  if (!to.length) throw new Error("to: at least one address");
  const headers = [
    `To: ${to.map(encodeAddress).join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.map(encodeAddress).join(", ")}`] : []),
    `Subject: ${encodeHeader(d.subject)}`,
    ...(d.inReplyTo ? [`In-Reply-To: ${encodeHeader(d.inReplyTo)}`] : []),
    ...(d.references ? [`References: ${encodeHeader(d.references)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = (Buffer.from(d.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}\r\n`, "utf8").toString("base64url");
}

/** "Name <a@b>" with a non-ASCII name: encode the name only. */
function encodeAddress(a: string): string {
  const m = a.match(/^(.*?)\s*<([^>]+)>$/);
  if (!m || !m[1]) return a;
  const name = m[1].replace(/^"|"$/g, "");
  return /^[\x20-\x7e]*$/.test(name) ? `${m[1]} <${m[2]}>` : `${encodeHeader(name)} <${m[2]}>`;
}

// ---------- labels ----------

export interface GmailLabel { id: string; name: string; type?: string }

/**
 * Only your own labels can be added. System ones (INBOX, SPAM, TRASH, IMPORTANT, …) would move or
 * hide mail, which isn't filing.
 */
export function checkUserLabels(ids: readonly string[], labels: readonly GmailLabel[]): GmailLabel[] {
  return ids.map((id) => {
    const l = labels.find((x) => x.id === id);
    if (!l) throw new Error(`no label with id "${id}" (list_labels shows the ids)`);
    if (l.type !== "user") throw new Error(`"${l.name}" is a Gmail system label; only your own labels can be added`);
    return l;
  });
}

// ---------- Calendar ----------

interface When { dateTime?: string; date?: string; timeZone?: string }
export interface CalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: When;
  end?: When;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: { email?: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean; resource?: boolean; optional?: boolean }[];
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  recurringEventId?: string;
  eventType?: string;
}

export function eventView(e: CalendarEvent, descriptionChars: number) {
  const people = (e.attendees ?? []).filter((a) => !a.resource);
  const video = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  const description = e.description ? clip(htmlToText(e.description), descriptionChars) : "";
  return {
    id: e.id,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    ...(e.start?.date ? { allDay: true } : {}),
    ...(e.status && e.status !== "confirmed" ? { status: e.status } : {}),
    ...(e.eventType && e.eventType !== "default" ? { type: e.eventType } : {}),
    ...(e.location ? { location: e.location } : {}),
    ...(e.organizer?.email ? { organizer: e.organizer.email } : {}),
    ...(people.length
      ? {
          attendees: people.map((a) => ({
            email: a.email ?? "",
            ...(a.displayName ? { name: a.displayName } : {}),
            ...(a.responseStatus ? { response: a.responseStatus } : {}),
            ...(a.self ? { you: true } : {}),
            ...(a.organizer ? { organizer: true } : {}),
            ...(a.optional ? { optional: true } : {}),
          })),
        }
      : {}),
    ...(video ? { video } : {}),
    ...(e.recurringEventId ? { recurring: true } : {}),
    ...(description ? { description } : {}),
  };
}

/** Run `fn` over `items`, at most `limit` at a time, keeping order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
