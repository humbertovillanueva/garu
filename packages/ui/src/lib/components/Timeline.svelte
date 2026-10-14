<script lang="ts">
  /** A run's flight recorder as a timeline. Tool calls are grouped with their decision and result. */
  import { clockExact, usd, tokens, statusLabel, decidedBy, expired, plainTimes, until } from "../format";
  import Decision from "./Decision.svelte";
  import { t } from "../i18n.svelte";
  /** Why the model was retried, in the reader's words; anything else is shown as the server said it. */
  const reasonLabel = (r: string) => (r === "rate limited" ? t("rate limited") : r === "high demand" ? t("high demand") : r);
  import type { Envelope } from "../types";

  let { events, compact = false }: { events: Envelope[]; compact?: boolean } = $props();
  let open = $state<Record<number, boolean>>({});

  type Row = { kind: "turn" | "call" | "other"; env: Envelope; children: Envelope[] };
  const rows = $derived.by((): Row[] => {
    const out: Row[] = [];
    const byCall = new Map<string, Row>();
    for (const env of events) {
      const e = env.event;
      const callId = e["callId"] as string | undefined;
      if (e.type === "tool.request" && callId) { const row: Row = { kind: "call", env, children: [] }; byCall.set(callId, row); out.push(row); }
      else if (callId && byCall.has(callId)) byCall.get(callId)!.children.push(env);
      else if (e.type === "model.turn") out.push({ kind: "turn", env, children: [] });
      else out.push({ kind: "other", env, children: [] });
    }
    return out;
  });
  function decisionOf(row: Row) {
    const d = row.children.find((c) => c.event.type === "policy.decision")?.event["decision"] as { action: "allow" | "ask" | "block"; reason: string } | undefined;
    const approval = row.children.find((c) => c.event.type === "approval.resolved")?.event as { approved: boolean; by: string; note?: string } | undefined;
    const waiting = !approval && row.children.some((c) => c.event.type === "approval.requested");
    const result = row.children.find((c) => c.event.type === "tool.result")?.event as { ok: boolean; durationMs: number; error?: string; result?: unknown } | undefined;
    return { d, approval, waiting, result };
  }
  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
</script>

<ol class="relative ml-2 border-l hairline">
  {#each rows as row (row.env.seq)}
    {@const e = row.env.event}
    <li class="rise relative pl-6" class:pb-3={compact} class:pb-4={!compact}>
      <span class="absolute -left-[5px] top-1.5 dot"
            style="background: {row.kind === 'call' ? 'var(--color-fg-2)' : row.kind === 'turn' ? 'var(--color-accent)' : e.type === 'error' || e.type === 'budget.exceeded' ? 'var(--color-bad)' : 'var(--color-line-2)'}"></span>

      {#if row.kind === "turn"}
        <div class="flex flex-wrap items-baseline gap-x-3 text-[13px]">
          <span class="mono text-mute">{clockExact(row.env.ts)}</span>
          <span class="font-medium" title={e["inputTokens"] !== undefined ? t("{input} tokens in, {output} out", { input: tokens(e["inputTokens"] as number), output: tokens(e["outputTokens"] as number) }) : undefined}>{t("Turn {n}", { n: e["turn"] as number })}</span>
          {#if e["totalCostUsd"] !== undefined}<span class="text-mute">{t("{cost} so far", { cost: usd(e["totalCostUsd"] as number) })}</span>{/if}
        </div>
        {#if e["text"]}<p class="mt-1 max-w-3xl whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-2">{plainTimes(String(e["text"]))}</p>{/if}

      {:else if row.kind === "call"}
        {@const req = e["request"] as { server: string; tool: string; args: Record<string, unknown> }}
        {@const { d, approval, waiting, result } = decisionOf(row)}
        <div class="panel overflow-hidden" style={waiting ? "border-color: color-mix(in oklab, var(--color-ask) 45%, var(--color-line))" : ""}>
          <button class="tap flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[13px]" aria-expanded={Boolean(open[row.env.seq])} onclick={() => (open[row.env.seq] = !open[row.env.seq])}>
            <span class="mono text-mute">{clockExact(row.env.ts)}</span>
            <span class="mono font-medium">{req.server}.{req.tool}</span>
            {#if d}<Decision action={d.action} />{/if}
            {#if approval}<Decision action={approval.approved ? "allow" : "block"} label={approval.approved ? (/^grant\b/.test(approval.by) ? t("allowed by your 24h approval") : t("approved by {who}", { who: decidedBy(approval.by) })) : expired(approval.by) ? t("expired, no answer") : t("declined by {who}", { who: decidedBy(approval.by) })} />{/if}
            {#if approval?.note}<span class="text-[12.5px] italic text-fg-2">“{approval.note}”</span>{/if}
            {#if waiting}<span class="pulse text-[12px]" style="color: var(--color-ask)">{t("waiting for you")}</span>{/if}
            {#if result}
              <span class="mono text-[12px]" style="color: {result.ok ? 'var(--color-mute)' : 'var(--color-bad)'}">{result.ok ? t("ok · {ms}ms", { ms: result.durationMs }) : t("error · {error}", { error: result.error ?? "" })}</span>
            {:else if d && d.action === "block"}
              <span class="mono text-[12px] text-mute">{t("never executed")}</span>
            {/if}
            <span class="ml-auto text-mute" aria-hidden="true">{open[row.env.seq] ? "−" : "+"}</span>
          </button>
          {#if open[row.env.seq]}
            <div class="grid gap-3 border-t hairline bg-bg/40 p-3 text-[12px] md:grid-cols-2">
              <div><div class="mb-1 text-[11px] uppercase tracking-wider text-mute">{t("arguments")}</div><pre class="mono max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{pretty(req.args)}</pre></div>
              <div><div class="mb-1 text-[11px] uppercase tracking-wider text-mute">{result ? t("result") : t("policy")}</div><pre class="mono max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{result ? pretty(result.result ?? result.error) : d?.reason}</pre></div>
            </div>
          {/if}
        </div>

      {:else}
        <div class="flex flex-wrap items-baseline gap-x-3 text-[13px]">
          <span class="mono text-mute">{clockExact(row.env.ts)}</span>
          {#if e.type === "run.start"}<span class="text-mute">{e["sandbox"] ? t("Run started, sandboxed") : t("Run started")}</span>
          {:else if e.type === "tools.offered"}{@const offered = (e["offered"] as string[]).length}{@const hidden = (e["hidden"] as string[]).length}<span class="text-mute">{offered === 1 ? t("1 tool offered") : t("{n} tools offered", { n: offered })}{hidden ? `, ${hidden === 1 ? t("1 more hidden because the policy always blocks it") : t("{n} more hidden because the policy always blocks them", { n: hidden })}` : ""}</span>
          {:else if e.type === "run.end"}<span class="font-medium">{t("Run {status}", { status: statusLabel(e["status"] as string) })}</span>{#if e["quota"]}{@const q = e["quota"] as { model: string; retryAt: string }}<span class="text-fg-2">— {t("Gemini's daily limit for {model} is used up; it resets {when}. Add billing to the key, or switch the model.", { model: q.model, when: until(q.retryAt) })}</span>{:else if e["summary"]}<span class="text-fg-2">— {plainTimes(String(e["summary"]))}</span>{/if}
          {:else if e.type === "budget.exceeded"}<span style="color: var(--color-bad)">{t("budget cap hit: {cost} reached the cap of {cap} — {n} call(s) not executed", { cost: usd(e["costUsd"] as number), cap: usd(e["maxCostUsd"] as number), n: e["pendingToolCalls"] as number })}</span>
          {:else if e.type === "model.retry"}<span style="color: var(--color-ask)">{t("model busy ({reason}) — retrying in {s}s, attempt {attempt} of {max}", { reason: reasonLabel(String(e["reason"])), s: Math.round((e["waitMs"] as number) / 1000), attempt: e["attempt"] as number, max: e["maxAttempts"] as number })}</span>
          {:else if e.type === "tools.retry"}<span style="color: var(--color-ask)">{t("tool server \"{server}\" didn't start in time — retrying in {s}s", { server: String(e["server"]), s: Math.round((e["waitMs"] as number) / 1000) })}</span>
          {:else if e.type === "error"}<span style="color: var(--color-bad)">{e["message"]}</span>
          {:else}<span class="mono text-mute">{e.type}</span>{/if}
        </div>
      {/if}
    </li>
  {/each}
</ol>
