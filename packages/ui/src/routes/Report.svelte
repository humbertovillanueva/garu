<script lang="ts">
  /**
   * Report a problem: what happened, in your words, plus the diagnostics that make it answerable
   * (build, device, Garu version, the tail of the service log with anything key-shaped masked).
   * Nothing is sent from here; the report opens as a draft GitHub issue, or copies to the clipboard.
   */
  import { api } from "../lib/api.svelte";
  import { build, isApp, server } from "../lib/server.svelte";
  let what = $state("");
  let includeLog = $state(true);
  let lines = $state<string[] | null>(null);
  let version = $state<string | null | undefined>(undefined); // undefined while still asking
  let copied = $state(false);
  let error = $state<string | null>(null);
  $effect(() => {
    api.settings().then((s) => (version = s.version)).catch(() => (version = null));
    api.logs(80).then((r) => (lines = r.lines)).catch(() => (lines = []));
  });
  const device = typeof navigator === "undefined" ? "" : navigator.userAgent.replace(/^Mozilla\/5\.0 \(/, "(").slice(0, 120);
  const report = $derived.by(() => {
    const parts = [
      `## What happened\n\n${what.trim() || "(describe it here)"}`,
      `## Where\n\n- ${isApp ? "Android app" : "Browser"}: ${build}\n- Garu: ${version === undefined ? "checking" : version ? `version ${version}` : "not reachable"}\n- Device: ${device}${isApp ? `\n- Paired with: ${server.base.replace(/^https?:\/\//, "").replace(/\.[^.]+\.ts\.net$/, ".….ts.net") || "—"}` : ""}`,
    ];
    if (includeLog && lines?.length) parts.push(`## Last lines of the service log\n\n\`\`\`\n${lines.slice(-40).join("\n")}\n\`\`\``);
    return parts.join("\n\n");
  });
  const title = $derived(what.trim().split("\n")[0]?.slice(0, 72) || "Problem report");
  const issueUrl = $derived(`https://github.com/humbertovillanueva/garu/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(report)}`);
  async function copy() {
    try { await navigator.clipboard.writeText(report); copied = true; setTimeout(() => (copied = false), 1500); } catch { error = "Couldn't copy; select the text below instead."; }
  }
</script>

<section class="mx-auto max-w-2xl space-y-5">
  <div class="rise">
    <h1 class="text-[24px] font-semibold tracking-tight">Report a problem</h1>
    <p class="mt-1 text-[13.5px] text-fg-2">Say what happened. The report opens as a draft issue on GitHub for you to review before posting; nothing is sent from here.</p>
  </div>
  <textarea class="field" rows="5" placeholder="What did you expect, and what happened instead?" bind:value={what}></textarea>
  <label class="flex items-center gap-3 text-[14px]">
    <input type="checkbox" class="h-4 w-4 accent-[var(--color-accent)]" bind:checked={includeLog} />
    <span>Include the last lines of Garu's log <span class="text-mute">(addresses and keys are masked)</span></span>
  </label>
  <div class="flex flex-wrap gap-2">
    <a class="btn btn-primary" href={issueUrl} target="_blank" rel="noreferrer">Open as a GitHub issue ↗</a>
    <button class="btn" onclick={copy}>{copied ? "Copied" : "Copy the report"}</button>
    {#if error}<span class="self-center text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
  </div>
  <details class="panel rise">
    <summary class="cursor-pointer px-4 py-3 text-[13.5px] text-fg-2">What the report contains</summary>
    <pre class="mono max-h-80 overflow-auto whitespace-pre-wrap break-words border-t hairline px-4 py-3 text-[12px] text-fg-2 select-all">{report}</pre>
  </details>
</section>
