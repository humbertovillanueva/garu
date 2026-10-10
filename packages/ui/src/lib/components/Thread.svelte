<script lang="ts">
  /**
   * The conversation with one agent: your messages, its replies, and its diary entries from other runs.
   * Diary entries are the noisy part (an hourly agent writes one every hour), so consecutive ones fold
   * into a single quiet line that opens on tap.
   */
  import { href } from "../router.svelte";
  import { clock, dayLabel, plainTimes } from "../format";
  import Mark from "./Mark.svelte";
  import { renderMarkdown } from "../md";
  import type { ChatMessage } from "../types";

  let { agent, messages }: { agent: string; messages: ChatMessage[]; userName?: string } = $props();

  type Item = { kind: "msg"; m: ChatMessage } | { kind: "diary"; runs: ChatMessage[] };
  const groups = $derived.by(() => {
    const out: { day: string; items: Item[] }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.ts);
      let g = out.at(-1);
      if (!g || g.day !== day) { g = { day, items: [] }; out.push(g); }
      const last = g.items.at(-1);
      if (m.role === "agent" && m.kind === "run") {
        if (last?.kind === "diary") last.runs.push(m); else g.items.push({ kind: "diary", runs: [m] });
      } else g.items.push({ kind: "msg", m });
    }
    return out;
  });

  let open = $state<Record<string, boolean>>({});
  const key = (runs: ChatMessage[]) => runs[0]!.id;
  /** "no change", "nothing changed", "ok" and the like: the run had nothing to say. */
  const quiet = (t: string) => /^\W*(no change|nothing (changed|new|to report)|ok|done)\W*$/i.test(t.trim());
  const oneLine = (t: string) => t.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  function headline(runs: ChatMessage[]): string {
    const n = runs.length;
    const allQuiet = runs.every((r) => quiet(r.text));
    const span = n === 1 ? clock(runs[0]!.ts) : `${clock(runs[0]!.ts)} – ${clock(runs.at(-1)!.ts)}`;
    if (allQuiet) return `${n === 1 ? "Ran" : `Ran ${n} times`}, nothing changed · ${span}`;
    if (n === 1) return `Ran · ${span}`;
    return `Ran ${n} times · ${span}`;
  }
</script>

<div class="space-y-5">
  {#each groups as g (g.day)}
    <div class="text-center text-[11px] text-mute">{g.day}</div>
    {#each g.items as it (it.kind === "msg" ? it.m.id : key(it.runs))}
      {#if it.kind === "diary"}
        {@const runs = it.runs}
        {@const k = key(runs)}
        {@const latest = runs.at(-1)!}
        {@const allQuiet = runs.every((r) => quiet(r.text))}
        <div class="rise flex items-start gap-3 text-[13px] text-fg-2">
          <Mark name={agent} size={22} />
          <div class="min-w-0 flex-1">
            <button class="flex w-full items-start gap-2 text-left" onclick={() => (open[k] = !open[k])} aria-expanded={Boolean(open[k])}>
              <span class="min-w-0 flex-1">
                <span class="block text-[12px] text-mute">{headline(runs)}</span>
                {#if !open[k] && !allQuiet}<span class="mt-0.5 line-clamp-2 block text-[13px] text-fg-2">{plainTimes(oneLine(([...runs].reverse().find((r) => !quiet(r.text)) ?? latest).text))}</span>{/if}
              </span>
              <span class="mt-0.5 flex-none text-mute transition-transform" style="transform: rotate({open[k] ? 90 : 0}deg)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>
            </button>
            {#if open[k]}
              <div class="mt-2 space-y-2">
                {#each runs as r (r.id)}
                  <div class="rounded-xl border border-dashed hairline px-3 py-2">
                    <div class="mb-0.5 text-[11px] text-mute">{clock(r.ts)}{#if r.runId}<span class="mx-1">·</span><a class="tap hover:text-fg" href={href("run", agent, r.runId)}>see the run</a>{/if}</div>
                    <div class="md space-y-2">{@html renderMarkdown(plainTimes(r.text))}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {:else if it.m.role === "user"}
        {@const m = it.m}
        <div class="rise flex justify-end">
          <div class="max-w-[80%]">
            <div class="rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed" style="background: color-mix(in oklab, var(--color-accent) 16%, var(--color-panel-2)); border: 1px solid color-mix(in oklab, var(--color-accent) 30%, var(--color-line-2))">
              <div class="whitespace-pre-wrap">{m.text}</div>
            </div>
            <div class="mt-1 text-right text-[11px] text-mute">{clock(m.ts)}</div>
          </div>
        </div>
      {:else}
        {@const m = it.m}
        <div class="rise flex items-start gap-3">
          <Mark name={agent} size={28} />
          <div class="min-w-0 max-w-[85%]">
            <div class="rounded-2xl rounded-tl-md px-4 py-2.5 text-[14px] leading-relaxed" class:panel={m.kind !== "error"}
                 style={m.kind === "error" ? "background: color-mix(in oklab, var(--color-bad) 10%, var(--color-panel)); border: 1px solid color-mix(in oklab, var(--color-bad) 35%, var(--color-line))" : ""}>
              <div class="md space-y-2">{@html renderMarkdown(plainTimes(m.text))}</div>
            </div>
            <div class="mt-1 text-[11px] text-mute">{clock(m.ts)}{#if m.runId}<span class="mx-1">·</span><a class="tap hover:text-fg" href={href("run", agent, m.runId)}>see the run</a>{/if}</div>
          </div>
        </div>
      {/if}
    {/each}
  {/each}
</div>
