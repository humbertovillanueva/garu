<script lang="ts">
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { clock, usd, tokens } from "../lib/format";
  import Decision from "../lib/components/Decision.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { Envelope } from "../lib/types";

  let { agent, runId }: { agent: string; runId: string } = $props();
  let events = $state<Envelope[] | null>(null);
  let missing = $state(false);
  let open = $state<Record<number, boolean>>({});
  $effect(() => {
    live.tick;
    api.run(agent, runId).then((e) => (events = e)).catch(() => (missing = true));
  });

  // Group tool.request → policy.decision → approval.* → tool.result by callId so one call reads as one block.
  type Row = { kind: "turn" | "call" | "other"; env: Envelope; children: Envelope[] };
  const rows = $derived.by((): Row[] => {
    if (!events) return [];
    const out: Row[] = [];
    const byCall = new Map<string, Row>();
    for (const env of events) {
      const e = env.event;
      const callId = e["callId"] as string | undefined;
      if (e.type === "tool.request" && callId) {
        const row: Row = { kind: "call", env, children: [] };
        byCall.set(callId, row);
        out.push(row);
      } else if (callId && byCall.has(callId)) {
        byCall.get(callId)!.children.push(env);
      } else if (e.type === "model.turn") {
        out.push({ kind: "turn", env, children: [] });
      } else {
        out.push({ kind: "other", env, children: [] });
      }
    }
    return out;
  });

  const start = $derived(events?.find((e) => e.event.type === "run.start")?.event);
  const end = $derived(events?.find((e) => e.event.type === "run.end")?.event);

  function decisionOf(row: Row) {
    const d = row.children.find((c) => c.event.type === "policy.decision")?.event["decision"] as { action: "allow" | "ask" | "block"; reason: string } | undefined;
    const approval = row.children.find((c) => c.event.type === "approval.resolved")?.event as { approved: boolean; by: string } | undefined;
    const result = row.children.find((c) => c.event.type === "tool.result")?.event as { ok: boolean; durationMs: number; error?: string; result?: unknown } | undefined;
    return { d, approval, result };
  }
  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
</script>

<section class="space-y-5">
  <div>
    <div class="text-[13px]">
      <a href={href("runs")} class="text-mute hover:text-fg">Runs</a> <span class="text-mute">/</span>
      <a href={href("runs", agent)} class="text-mute hover:text-fg">{agent}</a> <span class="text-mute">/</span>
      <span class="mono">{runId}</span>
    </div>
    {#if start}
      <div class="mono mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-mute">
        <span>{start["model"]}</span>
        <span>trigger {start["trigger"]}</span>
        {#if start["sandbox"]}<span>sandbox {(start["sandbox"] as {image:string;network:string}).image} · net {(start["sandbox"] as {network:string}).network}</span>{/if}
        {#if end}<span>→ {end["status"]} · {usd(end["costUsd"] as number, end["priced"] !== false)}</span>{/if}
      </div>
    {/if}
  </div>

  {#if missing}
    <Empty title="That run doesn't exist" />
  {:else if events === null}
    <div class="text-[13px] text-mute">loading…</div>
  {:else}
    <ol class="relative ml-2 border-l hairline">
      {#each rows as row (row.env.seq)}
        {@const e = row.env.event}
        <li class="relative pb-4 pl-6">
          <span class="absolute -left-[5px] top-1.5 dot"
                style="background: {row.kind === 'call' ? 'var(--color-fg-2)' : row.kind === 'turn' ? 'var(--color-accent)' : e.type === 'error' || e.type === 'budget.exceeded' ? 'var(--color-bad)' : 'var(--color-line-2)'}"></span>

          {#if row.kind === "turn"}
            <div class="flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <span class="mono text-mute">{clock(row.env.ts)}</span>
              <span class="font-medium">turn {e["turn"]}</span>
              {#if e["inputTokens"] !== undefined}<span class="mono text-mute">{tokens(e["inputTokens"] as number)} in · {tokens(e["outputTokens"] as number)} out</span>{/if}
              {#if e["totalCostUsd"] !== undefined}<span class="mono text-mute">{usd(e["totalCostUsd"] as number)} so far</span>{/if}
            </div>
            {#if e["text"]}<p class="mt-1 max-w-3xl whitespace-pre-wrap text-[13px] text-fg-2">{e["text"]}</p>{/if}

          {:else if row.kind === "call"}
            {@const req = e["request"] as { server: string; tool: string; args: Record<string, unknown> }}
            {@const { d, approval, result } = decisionOf(row)}
            <div class="panel overflow-hidden">
              <button class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[13px]" onclick={() => (open[row.env.seq] = !open[row.env.seq])}>
                <span class="mono text-mute">{clock(row.env.ts)}</span>
                <span class="mono font-medium">{req.server}.{req.tool}</span>
                {#if d}<Decision action={d.action} />{/if}
                {#if approval}<Decision action={approval.approved ? "allow" : "block"} label={approval.approved ? `approved · ${approval.by}` : `denied · ${approval.by}`} />{/if}
                {#if result}
                  <span class="mono text-[12px]" style="color: {result.ok ? 'var(--color-mute)' : 'var(--color-bad)'}">{result.ok ? `ok · ${result.durationMs}ms` : `error · ${result.error ?? ''}`}</span>
                {:else if d && d.action === "block"}
                  <span class="mono text-[12px] text-mute">never executed</span>
                {/if}
                <span class="ml-auto text-mute">{open[row.env.seq] ? "−" : "+"}</span>
              </button>
              {#if open[row.env.seq]}
                <div class="grid gap-3 border-t hairline bg-bg/40 p-3 text-[12px] md:grid-cols-2">
                  <div>
                    <div class="mb-1 text-[11px] uppercase tracking-wide text-mute">arguments</div>
                    <pre class="mono max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{pretty(req.args)}</pre>
                  </div>
                  <div>
                    <div class="mb-1 text-[11px] uppercase tracking-wide text-mute">{result ? "result" : "policy"}</div>
                    <pre class="mono max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{result ? pretty(result.result ?? result.error) : d?.reason}</pre>
                  </div>
                </div>
              {/if}
            </div>

          {:else}
            <div class="flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <span class="mono text-mute">{clock(row.env.ts)}</span>
              {#if e.type === "run.start"}<span class="text-mute">run started</span>
              {:else if e.type === "tools.offered"}<span class="text-mute">{(e["offered"] as string[]).length} tools offered{(e["hidden"] as string[]).length ? `, ${(e["hidden"] as string[]).length} hidden (always blocked)` : ""}</span>
              {:else if e.type === "run.end"}<span class="font-medium">run {e["status"]}</span>{#if e["summary"]}<span class="text-fg-2">— {e["summary"]}</span>{/if}
              {:else if e.type === "budget.exceeded"}<span style="color: var(--color-bad)">budget cap hit: {usd(e["costUsd"] as number)} ≥ {usd(e["maxCostUsd"] as number)} — {e["pendingToolCalls"]} call(s) not executed</span>
              {:else if e.type === "error"}<span style="color: var(--color-bad)">{e["message"]}</span>
              {:else}<span class="mono text-mute">{e.type}</span>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>
