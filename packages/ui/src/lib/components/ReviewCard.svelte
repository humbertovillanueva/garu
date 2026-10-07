<script lang="ts">
  /**
   * One paused tool call, shown as the thing it is: an email looks like an email,
   * a file write shows the file, a command shows the command. Approve or Decline.
   */
  import { api, live } from "../api.svelte";
  import { href } from "../router.svelte";
  import { until, when } from "../format";
  import Mark from "./Mark.svelte";
  import type { ApprovalRequest } from "../types";

  let { req, compact = false }: { req: ApprovalRequest; compact?: boolean } = $props();
  let busy = $state(false);
  let error = $state<string | null>(null);
  let showRaw = $state(false);

  async function decide(approve: boolean) {
    busy = true; error = null;
    try { await api.decide(req.id, approve); live.tick++; } catch (e) { error = String((e as Error).message ?? e); } finally { busy = false; }
  }

  const tool = $derived(req.tool.split(".").slice(1).join(".") || req.tool);
  const a = $derived(req.args as Record<string, unknown>);
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
  const list = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : typeof a[k] === "string" ? [a[k] as string] : undefined);

  type Shape = "email" | "file" | "command" | "generic";
  const shape = $derived.by((): Shape => {
    if (/send|mail|message|reply/i.test(tool) && (a["to"] || a["subject"] || a["body"] || a["recipients"])) return "email";
    if (/write|edit|create|append|save/i.test(tool) && (str("path") || str("file") || str("filename")) && (str("content") || str("text"))) return "file";
    if (/exec|shell|command|run|bash|terminal/i.test(tool) && (str("command") || str("cmd"))) return "command";
    return "generic";
  });
  const filePath = $derived(str("path") ?? str("file") ?? str("filename") ?? "");
  const fileName = $derived(filePath.split("/").pop() ?? filePath);
  const content = $derived(str("content") ?? str("text") ?? "");
  const verb = $derived(shape === "email" ? "wants to send" : shape === "file" ? "wants to write" : shape === "command" ? "wants to run" : "wants to call");
</script>

<div class="panel-raised rise overflow-hidden" style="border-color: color-mix(in oklab, var(--color-accent) 35%, var(--color-line-2))">
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
    <div class="mono text-right text-[11px] text-mute">
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
          <span class="ml-auto flex-none">{content.split("\n").length} lines · {content.length} chars</span>
        </div>
        <pre class="mono max-h-56 overflow-auto whitespace-pre-wrap px-3 py-3 text-[12.5px] leading-relaxed text-fg-2">{content}</pre>
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
                <td class="mono break-all px-3 py-1.5 text-fg-2">{typeof v === "string" ? v : JSON.stringify(v)}</td>
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
    <button class="btn btn-bad" disabled={busy} onclick={() => decide(false)}>Decline</button>
    {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
    <a href={href("run", req.agent, req.runId)} class="mono ml-auto text-[11.5px] text-mute hover:text-fg">open run →</a>
  </div>
</div>
