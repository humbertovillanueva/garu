<script lang="ts">
  /** "You've approved this N times. Make it a rule?" — with the exact rule shown before you say yes. */
  import { api, live } from "../api.svelte";
  import { href } from "../router.svelte";
  import Mark from "./Mark.svelte";
  import type { Suggestion } from "../types";

  let { s }: { s: Suggestion } = $props();
  let busy = $state(false);
  let done = $state<string | null>(null);
  let error = $state<string | null>(null);
  const yaml = $derived(() => {
    const lines = [`- tool: "${s.rule.tool}"`, `  action: allow`];
    if (s.rule.when) {
      lines.push(`  when:`);
      for (const [k, v] of Object.entries(s.rule.when)) lines.push(`    ${k}: ${JSON.stringify(v)}`);
    }
    return lines.join("\n");
  });
  async function apply() {
    busy = true; error = null;
    try { const r = await api.applySuggestion(s.id); done = r.file; live.tick++; } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
  async function dismiss() {
    busy = true;
    try { await api.dismissSuggestion(s.id); live.tick++; } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
</script>

<div class="panel-raised rise overflow-hidden" style="border-color: color-mix(in oklab, var(--color-ok) 30%, var(--color-line-2))">
  <div class="flex flex-wrap items-start gap-3 px-4 pt-4">
    <Mark name={s.agent} size={30} />
    <div class="min-w-0 flex-1">
      <div class="text-[14px]">
        You've approved <a href={href("agent", s.agent)} class="font-semibold hover:underline">{s.agent}</a> → <span class="mono">{s.tool}</span>
        <span class="font-semibold">{s.approvals} times</span> and never declined it.
      </div>
      <div class="mt-0.5 text-[13px] text-fg-2">Stop asking? This is the rule Garu would add, scoped to what you actually approved: <span class="text-fg">{s.summary}</span>.</div>
    </div>
  </div>
  <pre class="mono mx-4 mt-3 overflow-auto rounded-lg border hairline bg-bg/60 px-3 py-2 text-[12px] text-fg-2">{yaml()}</pre>
  <div class="mt-3 flex flex-wrap items-center gap-2 border-t hairline bg-bg/30 px-4 py-3">
    {#if done}
      <span class="text-[13px]" style="color: var(--color-ok)">Added to <span class="mono">{done}</span>. It applies from the next run.</span>
    {:else}
      <button class="btn btn-ok" disabled={busy} onclick={apply}>Add to Garufile</button>
      <button class="btn" disabled={busy} onclick={dismiss}>Not now</button>
      <span class="text-[12px] text-mute">Inserted above the current <span class="mono">ask</span> rule, comments kept.</span>
    {/if}
    {#if error}<span class="text-[12.5px]" style="color: var(--color-bad)">{error}</span>{/if}
  </div>
</div>
