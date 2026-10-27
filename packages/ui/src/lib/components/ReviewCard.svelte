<script lang="ts">
  import { tick } from "svelte";
  import { haptic } from "../native";
  /**
   * One paused tool call, shown as the thing it is: an email looks like an email,
   * a file write shows the file, a command shows the command. Approve or Decline.
   */
  import { api, live, refreshCore, errorText } from "../api.svelte";
  import { href } from "../router.svelte";
  import { until, when } from "../format";
  import Mark from "./Mark.svelte";
  import type { ApprovalRequest, WriteDiff } from "../types";
  import { announce } from "../a11y.svelte";
  import { t } from "../i18n.svelte";
  /** This card's element: where focus goes next is decided from its neighbours. */
  let cardEl = $state<HTMLElement | null>(null);

  let { req, compact = false }: { req: ApprovalRequest; compact?: boolean } = $props();
  let busy = $state(false);
  let error = $state<string | null>(null);
  let showRaw = $state(false);

  let declining = $state(false);
  let note = $state("");
  async function decide(approve: boolean, forDuration?: string) {
    if (busy) return; // a second tap, or Enter pressed twice in the note, decides nothing
    busy = true; error = null;
    try {
      await api.decide(req.id, approve, forDuration, approve ? undefined : note.trim() || undefined);
      void haptic(approve ? "success" : "warning");
      // The card leaves now instead of when the live stream catches up, so it can't be tapped again.
      // It stays busy until then: there is nothing left to decide on it. Say what happened, and move
      // focus to the next card (or the page), since the button that had it is about to disappear.
      announce(approve ? t("Approved: {agent}, {object}", { agent: req.agent, object }) : t("Declined: {agent}, {object}", { agent: req.agent, object }));
      const next = (cardEl?.nextElementSibling ?? cardEl?.previousElementSibling)?.querySelector<HTMLElement>("button") ?? document.querySelector<HTMLElement>("main");
      live.pending = live.pending.filter((p) => p.id !== req.id);
      live.tick++;
      void tick().then(() => next?.focus({ preventScroll: true }));
      void refreshCore().catch(() => {});
    } catch (e) { error = errorText(e); busy = false; }
  }
  function onNoteKey(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); void decide(false); }
    if (e.key === "Escape") { declining = false; note = ""; }
  }
  const scopeKey = $derived(["path", "url", "to", "recipient", "recipients", "channel", "command", "cmd", "query"].find((k) => a[k] !== undefined && a[k] !== null && (typeof a[k] !== "object" || Array.isArray(a[k]))));
  const SCOPE_WORD: Record<string, string> = $derived({ path: t("file"), url: t("address"), to: t("recipient"), recipient: t("recipient"), recipients: t("recipient"), channel: t("channel"), command: t("command"), cmd: t("command"), query: t("search") });
  const scope = $derived(scopeKey ? SCOPE_WORD[scopeKey] ?? scopeKey : "");
  const grantHint = $derived(scopeKey ? t("Also allow {tool} for this {scope} without asking, for 24 hours", { tool: req.tool, scope }) : t("Also allow {tool} with any arguments without asking, for 24 hours", { tool: req.tool }));
  // The same thing said on the card itself (a tooltip never shows on a phone).
  const grantNote = $derived(scopeKey ? t("“Approve for 24h” also allows {tool} for this {scope} without asking, for 24 hours.", { tool: req.tool, scope }) : t("“Approve for 24h” also allows {tool} with any arguments without asking, for 24 hours.", { tool: req.tool }));

  const tool = $derived(req.tool.split(".").slice(1).join(".") || req.tool);
  const a = $derived(req.args as Record<string, unknown>);
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  const list = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : typeof a[k] === "string" ? [a[k] as string] : undefined);
  // "Lena Ortiz <lena@example.com>" → the name as words, the address under it.
  const person = (x: string) => { const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/.exec(x); return m && m[1] ? { name: m[1], addr: m[2]! } : { name: "", addr: x }; };

  type Shape = "email" | "post" | "file" | "command" | "generic";
  const shape = $derived.by((): Shape => {
    if (/send|mail|message|reply|draft/i.test(tool) && (a["to"] || a["subject"] || a["body"] || a["recipients"])) return "email";
    if (/post|publish|message|notify|announce|say|chat/i.test(tool) && (str("text") || str("message") || str("content"))) return "post";
    if (/write|edit|create|append|save/i.test(tool) && (str("path") || str("file") || str("filename")) && (str("content") || str("text"))) return "file";
    if (/exec|shell|command|run|bash|terminal/i.test(tool) && (str("command") || str("cmd"))) return "command";
    return "generic";
  });
  const filePath = $derived(str("path") ?? str("file") ?? str("filename") ?? "");
  const fileName = $derived(filePath.split("/").pop() ?? filePath);
  const content = $derived(str("content") ?? str("text") ?? "");
  const postText = $derived(str("text") ?? str("message") ?? str("content") ?? "");
  const postTo = $derived(str("channel") ?? str("room") ?? str("chat_id") ?? str("recipient"));
  // What the card is about, for the header and the spoken "Approved: bea, …". A call with no better name is named by its tool id, never "a command".
  const object = $derived(shape === "file" ? fileName : shape === "email" ? t("an email") : shape === "post" ? (postTo ? t("a message to {to}", { to: postTo }) : t("a message")) : shape === "command" ? t("a command") : req.tool);
  // A draft only waits in Drafts; saying "send" would promise more than happens.
  const verb = $derived(shape === "email" ? (/draft/i.test(tool) ? t("wants to draft") : t("wants to send")) : shape === "post" ? t("wants to post") : shape === "file" ? t("wants to write") : shape === "command" ? t("wants to run") : t("wants to call"));

  // For a file write: what would actually change. Unchanged lines collapse to a little context; tap to see everything.
  let diff = $state<WriteDiff | null>(null);
  let wholeFile = $state(false);
  $effect(() => { if (shape === "file") api.diff(req.id).then((d) => (diff = d)).catch(() => (diff = { error: "n/a" })); });
  const CONTEXT = 2;
  type Row = { t: "=" | "+" | "-" | "…"; s: string; n?: number };
  const rows = $derived.by((): Row[] => {
    const lines = diff?.lines;
    if (!lines) return [];
    if (wholeFile) return lines;
    const keep = new Set<number>();
    lines.forEach((l, i) => { if (l.t !== "=") for (let k = i - CONTEXT; k <= i + CONTEXT; k++) keep.add(k); });
    const out: Row[] = [];
    let skipping = 0;
    lines.forEach((l, i) => {
      if (keep.has(i)) { if (skipping) { out.push({ t: "…", s: "", n: skipping }); skipping = 0; } out.push(l); }
      else skipping++;
    });
    if (skipping) out.push({ t: "…", s: "", n: skipping });
    return out;
  });
  const diffReady = $derived(Boolean(diff?.lines));
  const changeLabel = $derived.by(() => {
    if (!diff?.lines) return "";
    if (diff.isNew) return t("new file · {n} lines", { n: diff.added ?? 0 });
    if (!diff.added && !diff.removed) return t("no change");
    return t("+{added} −{removed} · {before} lines before", { added: diff.added ?? 0, removed: diff.removed ?? 0, before: diff.lines.length - (diff.added ?? 0) });
  });
</script>

<div bind:this={cardEl} class="panel-raised rise overflow-hidden" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line-2))">
  <div class="flex flex-wrap items-start gap-3 px-4 pt-4">
    <Mark name={req.agent} size={34} status="waiting" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 text-[14px]">
        <a href={href("agent", req.agent)} class="font-semibold hover:underline">{req.agent}</a>
        <span class="text-fg-2">{verb}</span>
        {#if shape === "generic"}
          <span class="mono font-medium">{tool}</span>
        {:else}
          <span class="font-medium" class:mono={shape === "file"}>{object}</span>
          <span class="mono rounded border hairline px-1.5 text-[11px] text-mute" title={req.tool}>{tool}</span>
        {/if}
      </div>
      <div class="mt-0.5 text-[13px] text-fg-2">{req.reason}</div>
    </div>
    <div class="flex w-full gap-3 text-[11.5px] text-mute sm:block sm:w-auto sm:text-right">
      <div>{t("asked {when}", { when: when(req.createdAt) })}</div>
      <div>{t("expires {until}", { until: until(req.expiresAt) })}</div>
    </div>
  </div>

  <div class="px-4 pt-3">
    {#if shape === "email"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b hairline px-3 py-2 text-[13px]">
          <!-- Every address in full, one per line: who it goes to is what you're approving. -->
          {#snippet people(xs: string[])}<span class="min-w-0 space-y-1 [overflow-wrap:anywhere]">{#each xs.map(person) as p}<span class="block">{#if p.name}<span class="block">{p.name}</span>{/if}<span class="mono block {p.name ? 'text-[12px] text-mute' : ''}">{p.addr}</span></span>{/each}</span>{/snippet}
          <span class="text-mute">{t("To")}</span>{@render people(list("to") ?? list("recipients") ?? [])}
          {#if list("cc")?.length}<span class="text-mute">{t("Cc")}</span>{@render people(list("cc")!)}{/if}
          {#if str("subject")}<span class="text-mute">{t("Subject")}</span><span class="min-w-0 font-medium [overflow-wrap:anywhere]">{str("subject")}</span>{/if}
        </div>
        <pre class="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-[13px] leading-relaxed text-fg-2 [overflow-wrap:anywhere]" style="font-family: inherit">{str("body") ?? str("text") ?? str("message") ?? ""}</pre>
      </div>
    {:else if shape === "file"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="flex items-center gap-2 border-b hairline px-3 py-1.5 text-[11.5px] text-mute">
          <span class="mono min-w-0 [overflow-wrap:anywhere]">{filePath}</span>
          <span class="ml-auto flex-none">{diffReady ? changeLabel : t("{lines} lines · {chars} chars", { lines: content.split("\n").length, chars: content.length })}</span>
        </div>
        {#if diffReady}
          <pre class="mono max-h-64 overflow-auto px-0 py-2 text-[12.5px] leading-relaxed">{#each rows as r}<div class="diffline" data-t={r.t}>{#if r.t === "…"}<button class="tap w-full py-1.5 text-left text-mute" onclick={() => (wholeFile = true)}><span aria-hidden="true">⋯ </span>{r.n === 1 ? t("1 unchanged line") : t("{n} unchanged lines", { n: r.n ?? 0 })}</button>{:else}<span class="sign">{r.t === "=" ? " " : r.t}</span>{r.s}{/if}</div>{/each}</pre>
          {#if wholeFile && (diff?.unchanged ?? 0) > 0}<button class="tap border-t hairline px-3 py-1.5 text-[11.5px] text-mute hover:text-fg" onclick={() => (wholeFile = false)}>{t("show only the change")}</button>{/if}
        {:else}
          {#if diff?.secret}<p class="border-b hairline px-3 py-2 text-[12px] text-mute">{t("This file holds secrets, so the current one isn't shown; below is what {agent} wants to write.", { agent: req.agent })}</p>
          {:else if diff?.outside}<p class="border-b hairline px-3 py-2 text-[12px] text-mute">{t("This path is outside the project folder, so the current file isn't shown; below is what {agent} wants to write.", { agent: req.agent })}</p>{/if}
          <pre class="mono max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-[12.5px] leading-relaxed text-fg-2">{content}</pre>
        {/if}
      </div>
    {:else if shape === "post"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="flex flex-wrap items-center gap-x-3 border-b hairline px-3 py-1.5 text-[11.5px] text-mute">
          <span>{postTo ? t("to {to}", { to: postTo }) : t("message")}</span>
          <span class="ml-auto flex-none">{t("{lines} lines · {chars} chars", { lines: postText.split("\n").length, chars: postText.length })}</span>
        </div>
        <pre class="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-3 text-[13px] leading-relaxed text-fg-2" style="font-family: inherit">{postText}</pre>
      </div>
    {:else if shape === "command"}
      <pre class="mono overflow-auto rounded-lg border hairline bg-bg/60 px-3 py-3 text-[12.5px] text-fg-2"><span class="text-mute">$ </span>{str("command") ?? str("cmd")}</pre>
    {:else}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <table class="w-full text-[12.5px]">
          <tbody>
            {#each Object.entries(a) as [k, v]}
              <tr class="border-b hairline last:border-0 align-top">
                <td class="mono whitespace-nowrap px-3 py-1.5 text-mute">{k}</td>
                <td class="mono w-full whitespace-pre-wrap px-3 py-1.5 text-fg-2 [overflow-wrap:anywhere]">{typeof v === "string" ? v : JSON.stringify(v)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if shape !== "generic"}
      <button class="tap mt-2 text-[11.5px] text-mute hover:text-fg" aria-expanded={showRaw} onclick={() => (showRaw = !showRaw)}>{showRaw ? t("hide raw arguments") : t("show raw arguments")}</button>
      {#if showRaw}<pre class="mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg/60 p-2 text-[11.5px] text-mute">{JSON.stringify(req.args, null, 2)}</pre>{/if}
    {/if}
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 border-t hairline bg-bg/30 px-4 py-3">
    <button class="btn btn-ok" disabled={busy} onclick={() => decide(true)}>{t("Approve")}</button>
    <button class="btn" disabled={busy} title={grantHint} onclick={() => decide(true, "24h")}>{t("Approve for 24h")}</button>
    {#if !declining}
      <button class="btn btn-bad" disabled={busy} onclick={() => (declining = true)}>{t("Decline")}</button>
    {/if}
    {#if error}<span class="text-[12.5px]" role="alert" style="color: var(--color-bad)">{error}</span>{/if}
    <a href={href("run", req.agent, req.runId)} class="tap ml-auto text-[12px] text-mute hover:text-fg">{t("open run")} <span aria-hidden="true">→</span></a>
    <!-- What the 24h button really grants, on the card itself: a tooltip never shows on a phone. -->
    <span class="basis-full text-[11.5px] text-mute">{grantNote}</span>
  </div>
  {#if declining}
    <!-- A decline can carry a reason. The agent reads it before its next step, so "wrong repo" fixes the run instead of just stopping one call. -->
    <div class="flex flex-wrap items-center gap-2 border-t hairline bg-bg/30 px-4 py-3">
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field min-w-0 flex-1" aria-label={t("Why you're declining (optional)")} placeholder={t("Why? Optional. {agent} reads this before its next step, e.g. shorter, and don't promise a date", { agent: req.agent })} bind:value={note} onkeydown={onNoteKey} autofocus />
      <button class="btn btn-bad" disabled={busy} onclick={() => decide(false)}>{note.trim() ? t("Decline with note") : t("Decline")}</button>
      <button class="btn" disabled={busy} onclick={() => { declining = false; note = ""; }}>{t("Cancel")}</button>
    </div>
  {/if}
</div>
