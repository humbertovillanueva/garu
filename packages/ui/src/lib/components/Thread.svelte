<script lang="ts">
  /** The conversation with one agent: your messages, its replies, and its diary entries from other runs. */
  import { href } from "../router.svelte";
  import { clock, dayLabel, when } from "../format";
  import Mark from "./Mark.svelte";
  import { renderMarkdown } from "../md";
  import type { ChatMessage } from "../types";

  let { agent, messages, userName = "You" }: { agent: string; messages: ChatMessage[]; userName?: string } = $props();
  const groups = $derived.by(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.ts);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(m); else out.push({ day, items: [m] });
    }
    return out;
  });
</script>

<div class="space-y-5">
  {#each groups as g (g.day)}
    <div class="mono text-center text-[11px] text-mute">{g.day}</div>
    {#each g.items as m (m.id)}
      {#if m.role === "user"}
        <div class="rise flex justify-end">
          <div class="max-w-[80%]">
            <div class="rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed" style="background: color-mix(in oklab, var(--color-accent) 16%, var(--color-panel-2)); border: 1px solid color-mix(in oklab, var(--color-accent) 30%, var(--color-line-2))">
              <div class="whitespace-pre-wrap">{m.text}</div>
            </div>
            <div class="mono mt-1 text-right text-[11px] text-mute">{userName} · {clock(m.ts)}</div>
          </div>
        </div>
      {:else if m.kind === "run"}
        <div class="rise flex items-start gap-3 text-[13px] text-fg-2">
          <Mark name={agent} size={22} />
          <div class="min-w-0 flex-1 rounded-xl border border-dashed hairline px-3 py-2">
            <div class="mono mb-0.5 text-[11px] text-mute">finished a run · {clock(m.ts)}{#if m.runId} · <a class="hover:text-fg" href={href("run", agent, m.runId)}>open run →</a>{/if}</div>
            <div class="md space-y-2">{@html renderMarkdown(m.text)}</div>
          </div>
        </div>
      {:else}
        <div class="rise flex items-start gap-3">
          <Mark name={agent} size={28} />
          <div class="min-w-0 max-w-[85%]">
            <div class="rounded-2xl rounded-tl-md px-4 py-2.5 text-[14px] leading-relaxed" class:panel={m.kind !== "error"}
                 style={m.kind === "error" ? "background: color-mix(in oklab, var(--color-bad) 10%, var(--color-panel)); border: 1px solid color-mix(in oklab, var(--color-bad) 35%, var(--color-line))" : ""}>
              <div class="md space-y-2">{@html renderMarkdown(m.text)}</div>
            </div>
            <div class="mono mt-1 text-[11px] text-mute">{clock(m.ts)}{#if m.runId} · <a class="hover:text-fg" href={href("run", agent, m.runId)}>open run →</a>{/if}</div>
          </div>
        </div>
      {/if}
    {/each}
  {/each}
</div>
