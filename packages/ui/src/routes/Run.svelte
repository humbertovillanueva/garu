<script lang="ts">
  import { api, live, agentByName } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, duration } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import Status from "../lib/components/Status.svelte";
  import Budget from "../lib/components/Budget.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { Envelope } from "../lib/types";

  let { agent, runId }: { agent: string; runId: string } = $props();
  let events = $state<Envelope[] | null>(null);
  let missing = $state(false);
  $effect(() => { live.tick; api.run(agent, runId).then((e) => (events = e)).catch(() => (missing = true)); });

  const a = $derived(agentByName(agent));
  const start = $derived(events?.find((e) => e.event.type === "run.start"));
  const end = $derived(events?.find((e) => e.event.type === "run.end"));
  const status = $derived(end ? (end.event["status"] as string) : "running");
  const cost = $derived.by(() => {
    if (end && end.event["costUsd"] !== undefined) return end.event["costUsd"] as number;
    const last = [...(events ?? [])].reverse().find((e) => e.event.type === "model.turn" && e.event["totalCostUsd"] !== undefined);
    return (last?.event["totalCostUsd"] as number | undefined) ?? 0;
  });
  const turns = $derived((events ?? []).filter((e) => e.event.type === "model.turn").length);
</script>

<section class="space-y-5">
  <div class="rise flex flex-wrap items-center gap-3">
    <Mark name={agent} size={40} status={status === "running" ? "working" : "idle"} />
    <div class="min-w-0 flex-1">
      <div class="text-[12.5px] text-mute"><a href={href("agent", agent)} class="hover:text-fg">{agent}</a> / <span class="mono">{runId}</span></div>
      <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Status {status} />
        {#if start}
          <span class="mono text-[12px] text-mute">{start.event["model"]}</span>
          <span class="mono text-[12px] text-mute">trigger {start.event["trigger"]}</span>
          {#if start.event["sandbox"]}<span class="chip mono text-[11px]">sandboxed · net {(start.event["sandbox"] as {network:string}).network}</span>{/if}
          <span class="mono text-[12px] text-mute">{turns} turn{turns === 1 ? "" : "s"}{end ? ` · ${duration(start.ts, end.ts)}` : ""}</span>
        {/if}
      </div>
    </div>
    <Budget spent={cost} cap={a?.budget?.maxCostUsd ?? null} free={a?.budget?.free ?? (end?.event["priced"] === false)} />
  </div>

  {#if missing}
    <Empty title="That run doesn't exist" />
  {:else if events === null}
    <Skeleton rows={6} h={40} />
  {:else}
    <div class="panel p-4"><Timeline {events} /></div>
  {/if}
</section>
