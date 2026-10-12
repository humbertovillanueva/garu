<script lang="ts">
  import { api, live, agentByName, loader, HttpError } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, duration, humanTime, cronLabel, triggerLabel } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import Status from "../lib/components/Status.svelte";
  import Budget from "../lib/components/Budget.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { Envelope } from "../lib/types";
  import { t } from "../lib/i18n.svelte";

  let { agent, runId }: { agent: string; runId: string } = $props();
  let events = $state<Envelope[] | null>(null);
  let missing = $state(false);
  let error = $state<string | null>(null);
  const load = loader();
  // Only a 404 means the run isn't there; being offline is a different message.
  $effect(() => {
    live.tick;
    load(api.run(agent, runId), (e) => { events = e; missing = false; error = null; }, (m, e) => {
      if (e instanceof HttpError && e.status === 404) missing = true; else error = m;
    });
  });

  const a = $derived(agentByName(agent));
  const start = $derived(events?.find((e) => e.event.type === "run.start"));
  const end = $derived(events?.find((e) => e.event.type === "run.end"));
  // No end recorded: running only if it's the agent's current run or one waiting on you; otherwise Garu stopped mid-run.
  const live_ = $derived(a?.inFlight?.runId === runId || live.pending.some((p) => p.runId === runId));
  const status = $derived(end ? (end.event["status"] as string) : live_ ? "running" : "interrupted");
  const cost = $derived.by(() => {
    if (end && end.event["costUsd"] !== undefined) return end.event["costUsd"] as number;
    const last = [...(events ?? [])].reverse().find((e) => e.event.type === "model.turn" && e.event["totalCostUsd"] !== undefined);
    return (last?.event["totalCostUsd"] as number | undefined) ?? 0;
  });
  const turns = $derived((events ?? []).filter((e) => e.event.type === "model.turn").length);
  /** How the run started, in words: "Scheduled, Weekdays 7:00 AM", "Catch-up for Daily 9:00 AM", "From a message". */
  const how = $derived.by(() => {
    const trigger = String(start?.event["trigger"] ?? "");
    if (trigger.startsWith("cron:")) return t("Scheduled, {schedule}", { schedule: cronLabel(trigger.slice(5)) });
    if (trigger.startsWith("catch-up:")) return t("Catch-up for {schedule}", { schedule: cronLabel(trigger.slice(9)) });
    if (trigger === "chat") return t("From a message");
    if (trigger === "manual" || trigger === "ui") return t("Started with Run now");
    const w = triggerLabel(trigger);
    return w ? w[0]!.toUpperCase() + w.slice(1) : "";
  });
  const sandbox = $derived(start?.event["sandbox"] as { network: string } | undefined);
</script>

<section class="space-y-5">
  <div class="rise flex flex-wrap items-center gap-3">
    <Mark name={agent} size={40} status={events && status === "running" ? "working" : "idle"} />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={href("agent", agent)} class="text-[20px] font-semibold tracking-tight hover:underline">{agent}</a>
        {#if events}<Status {status} />{/if}
      </div>
      {#if start}
        <div class="mt-0.5 text-[13px] text-fg-2">{[how, humanTime(start.ts), end ? t("took {duration}", { duration: duration(start.ts, end.ts) }) : "", turns === 1 ? t("1 turn") : t("{n} turns", { n: turns })].filter(Boolean).join(" · ")}</div>
        <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-mute" title={t("run {id}", { id: runId })}>
          <span class="mono">{start.event["model"]}</span>
          {#if sandbox}<span>· {t("sandboxed, network {network}", { network: sandbox.network })}</span>{/if}
        </div>
      {/if}
    </div>
    {#if events}<Budget spent={cost} cap={a?.budget?.maxCostUsd ?? null} free={a?.budget?.free ?? (end?.event["priced"] === false)} />{/if}
  </div>

  {#if missing}
    <Empty title={t("That run doesn't exist")} />
  {:else if events === null}
    {#if error}<LoadError message={error} />{:else}<Skeleton rows={6} h={40} />{/if}
  {:else}
    <div class="panel p-4"><Timeline {events} /></div>
  {/if}
</section>
