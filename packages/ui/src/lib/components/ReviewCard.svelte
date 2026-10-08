<script lang="ts">
  import { haptic } from "../native";
  /**
   * One paused tool call, shown as the thing it is: an email looks like an email,
   * a file write shows the file, a command shows the command. Approve or Decline.
   */
  import { api, live } from "../api.svelte";
  import { href } from "../router.svelte";
  import { until, when } from "../format";
  import Mark from "./Mark.svelte";
  import type { ApprovalRequest, WriteDiff } from "../types";

  let { req, compact = false }: { req: ApprovalRequest; compact?: boolean } = $props();
  let busy = $state(false);
  let error = $state<string | null>(null);
  let showRaw = $state(false);

  let declining = $state(false);
  let note = $state("");
  async function decide(approve: boolean, forDuration?: string) {
    busy = true; error = null;
    try { await api.decide(req.id, approve, forDuration, approve ? undefined : note.trim() || undefined); live.tick++; void haptic(approve ? "success" : "warning"); } catch (e) { error = String((e as Error).message ?? e); } finally { busy = false; }
  }
  function onNoteKey(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); void decide(false); }
    if (e.key === "Escape") { declining = false; note = ""; }
  }
  const scopeKey = $derived(["path", "url", "to", "recipient", "recipients", "channel", "command", "cmd", "query"].find((k) => a[k] !== undefined && a[k] !== null && (typeof a[k] !== "object" || Array.isArray(a[k]))));
  const grantHint = $derived(scopeKey ? `Also allow ${req.tool} on this ${scopeKey} without asking, for 24 hours` : `Also allow ${req.tool} with any arguments without asking, for 24 hours`);

  const tool = $derived(req.tool.split(".").slice(1).join(".") || req.tool);
  const a = $derived(req.args as Record<string, unknown>);
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  const list = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : typeof a[k] === "string" ? [a[k] as string] : undefined);

  type Shape = "email" | "post" | "file" | "command" | "generic";
  const shape = $derived.by((): Shape => {
    if (/send|mail|message|reply/i.test(tool) && (a["to"] || a["subject"] || a["body"] || a["recipients"])) return "email";
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
  const verb = $derived(shape === "email" ? "wants to send" : shape === "post" ? "wants to post" : shape === "file" ? "wants to write" : shape === "command" ? "wants to run" : "wants to call");

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
    if (diff.isNew) return `new file · ${diff.added} lines`;
    if (!diff.added && !diff.removed) return "no change";
    return `+${diff.added} −${diff.removed} · ${diff.lines.length - (diff.added ?? 0)} lines before`;
  });
</script>

<div class="panel-raised rise overflow-hidden" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line-2))">
  <div class="flex flex-wrap items-start gap-3 px-4 pt-4">
    <Mark name={req.agent} size={34} status="waiting" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 text-[14px]">
        <a href={href("agent", req.agent)} class="font-semibold hover:underline">{req.agent}</a>
        <span class="text-fg-2">{verb}</span>
        <span class="mono font-medium">{shape === "file" ? fileName : shape === "email" ? "an email" : tool}</span>
      </div>
      <div class="mt-0.5 text-[13px] text-fg-2">{req.reason}</div>
    </div>
    <div class="mono flex w-full gap-3 text-[11px] text-mute sm:block sm:w-auto sm:text-right">
      <div>asked {when(req.createdAt)}</div>
      <div>expires in {until(req.expiresAt)}</div>
    </div>
  </div>

  <div class="px-4 pt-3">
    {#if shape === "email"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="grid grid-cols-[64px_1fr] gap-y-1 border-b hairline px-3 py-2 text-[13px]">
          <span class="text-mute">To</span><span class="mono truncate">{(list("to") ?? list("recipients") ?? []).join(", ")}</span>
          {#if list("cc")?.length}<span class="text-mute">Cc</span><span class="mono truncate">{list("cc")!.join(", ")}</span>{/if}
          {#if str("subject")}<span class="text-mute">Subject</span><span class="font-medium">{str("subject")}</span>{/if}
        </div>
        <pre class="max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-[13px] leading-relaxed text-fg-2">{str("body") ?? str("text") ?? str("message") ?? ""}</pre>
      </div>
    {:else if shape === "file"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="mono flex items-center gap-2 border-b hairline px-3 py-1.5 text-[11.5px] text-mute">
          <span class="truncate" title={filePath}>{filePath}</span>
          <span class="ml-auto flex-none">{diffReady ? changeLabel : `${content.split("\n").length} lines · ${content.length} chars`}</span>
        </div>
        {#if diffReady}
          <pre class="mono max-h-64 overflow-auto px-0 py-2 text-[12.5px] leading-relaxed">{#each rows as r}<div class="diffline" data-t={r.t}>{#if r.t === "…"}<button class="w-full text-left text-mute" onclick={() => (wholeFile = true)}>⋯ {r.n} unchanged line{r.n === 1 ? "" : "s"}</button>{:else}<span class="sign">{r.t === "=" ? " " : r.t}</span>{r.s}{/if}</div>{/each}</pre>
          {#if wholeFile && (diff?.unchanged ?? 0) > 0}<button class="mono border-t hairline px-3 py-1.5 text-[11px] text-mute hover:text-fg" onclick={() => (wholeFile = false)}>show only the change</button>{/if}
        {:else}
          <pre class="mono max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-[12.5px] leading-relaxed text-fg-2">{content}</pre>
        {/if}
      </div>
    {:else if shape === "post"}
      <div class="overflow-hidden rounded-lg border hairline bg-bg/60">
        <div class="mono flex items-center gap-3 border-b hairline px-3 py-1.5 text-[11.5px] text-mute">
          <span>{postTo ? `to ${postTo}` : "message"}</span>
          <span class="ml-auto flex-none">{postText.split("\n").length} lines · {postText.length} chars</span>
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
                <td class="mono w-32 px-3 py-1.5 text-mute">{k}</td>
                <td class="mono whitespace-pre-wrap break-words px-3 py-1.5 text-fg-2">{typeof v === "string" ? v : JSON.stringify(v)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if shape !== "generic"}
      <button class="mono mt-2 text-[11px] text-mute hover:text-fg" onclick={() => (showRaw = !showRaw)}>{showRaw ? "hide" : "show"} raw arguments</button>
      {#if showRaw}<pre class="mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg/60 p-2 text-[11.5px] text-mute">{JSON.stringify(req.args, null, 2)}</pre>{/if}
    {/if}
  </div>

  <div class="mt-3 flex flex-wrap items-center gap-2 border-t hairline bg-bg/30 px-4 py-3">
    <button class="btn btn-ok" disabled={busy} onclick={() => decide(true)}>Approve</button>
    <button class="btn" disabled={busy} title={grantHint} onclick={() => decide(true, "24h")}>Approve for 24h</button>
    {#if !declining}
      <button class="btn btn-bad" disabled={busy} onclick={() => (declining = true)}>Decline</button>
    {/if}
    {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
    <a href={href("run", req.agent, req.runId)} class="mono ml-auto text-[11.5px] text-mute hover:text-fg">open run →</a>
  </div>
  {#if declining}
    <!-- A decline can carry a reason. The agent reads it before its next step, so "wrong repo" fixes the run instead of just stopping one call. -->
    <div class="flex flex-wrap items-center gap-2 border-t hairline bg-bg/30 px-4 py-3">
      <!-- svelte-ignore a11y_autofocus -->
      <input class="field min-w-0 flex-1" style="min-height: 36px; padding: 6px 10px" placeholder="Why? Optional — {req.agent} reads this before its next step. e.g. wrong repo, use humbertovillanueva/garu" bind:value={note} onkeydown={onNoteKey} autofocus />
      <button class="btn btn-bad" disabled={busy} onclick={() => decide(false)}>{note.trim() ? "Decline with note" : "Decline"}</button>
      <button class="btn" disabled={busy} onclick={() => { declining = false; note = ""; }}>Cancel</button>
    </div>
  {/if}
</div>
