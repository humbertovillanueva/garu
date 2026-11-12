<script lang="ts">
  import { api, live, agentByName, loader, HttpError } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, duration, span, humanTime, clock, cronLabel, triggerLabel, plainTimes, until } from "../lib/format";
  import { renderMarkdown } from "../lib/md";
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
  // A run the network cut off before it changed anything is "offline": not an error, and the schedule runs it again.
  const offline = $derived(end?.event["offline"] === true);
  // Parked: the run put itself away on an ask and will pick up in this same log once you answer.
  const parked = $derived([...(events ?? [])].reverse().find((e) => e.event.type === "run.parked" || e.event.type === "run.resumed")?.event.type === "run.parked");
  // The model stayed busy through every retry: nothing was done either, and the schedule tries again.
  const busy = $derived(end?.event["busy"] as { model: string; reason: string } | undefined);
  const status = $derived(end ? (busy ? "busy" : offline ? "offline" : (end.event["status"] as string)) : parked ? "parked" : live_ ? "running" : "interrupted");
  const reasonLabel = (r: string) => (r === "rate limited" ? t("rate limited") : r === "high demand" ? t("high demand") : r);
  const scheduled = $derived(/^(cron|catch-up):/.test(String(start?.event["trigger"] ?? "")));
  const cost = $derived.by(() => {
    if (end && end.event["costUsd"] !== undefined) return end.event["costUsd"] as number;
    const last = [...(events ?? [])].reverse().find((e) => e.event.type === "model.turn" && e.event["totalCostUsd"] !== undefined);
    return (last?.event["totalCostUsd"] as number | undefined) ?? 0;
  });
  const turns = $derived((events ?? []).filter((e) => e.event.type === "model.turn").length);
  // A catch-up, or a fire the computer slept through: the schedule meant it for earlier.
  const due = $derived(start?.event["dueAt"] as string | undefined);
  const lateMs = $derived(due && start ? new Date(start.ts).getTime() - new Date(due).getTime() : 0);
  /** Time the computer spent asleep mid-run: part of "took 1 h", none of it the agent's. */
  const asleep = $derived((events ?? []).filter((e) => e.event.type === "host.slept").reduce((n, e) => n + (e.event["ms"] as number), 0));
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
  // What the run produced comes first: the document it wrote (a brief), then what it said. The
  // step-by-step is for when you want to know how, so it folds away unless the run is still going.
  const doc = $derived.by(() => {
    const writes = (events ?? []).filter((e) => {
      if (e.event.type !== "tool.request") return false;
      const r = e.event["request"] as { tool?: string; args?: Record<string, unknown> } | undefined;
      return /write_file$/.test(r?.tool ?? "") && typeof r?.args?.["content"] === "string" && /\.md$/i.test(String(r?.args?.["path"] ?? ""));
    });
    const w = writes.at(-1);
    if (!w) return null;
    const ok = (events ?? []).some((e) => e.event.type === "tool.result" && e.event["callId"] === w.event["callId"] && e.event["ok"]);
    const r = w.event["request"] as { args: { path: string; content: string } };
    return ok ? { path: r.args.path, content: r.args.content } : null;
  });
  const reply = $derived.by(() => {
    const last = [...(events ?? [])].reverse().find((e) => e.event.type === "model.turn" && String(e.event["text"] ?? "").trim());
    return last ? String(last.event["text"]) : String(end?.event["summary"] ?? "");
  });
  const quota = $derived(end?.event["quota"] as { model: string; retryAt: string } | undefined);
  let steps = $state(false);
  $effect(() => { if (status === "running") steps = true; });
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
        <div class="mt-0.5 text-[13px] text-fg-2">{[how, humanTime(start.ts), lateMs >= 60_000 && due ? t("started {span} late, due {time}", { span: span(lateMs), time: clock(due) }) : "", end ? (asleep ? t("took {duration}, {asleep} of it with the computer asleep", { duration: duration(start.ts, end.ts), asleep: span(asleep) }) : t("took {duration}", { duration: duration(start.ts, end.ts) })) : "", turns === 1 ? t("1 turn") : t("{n} turns", { n: turns })].filter(Boolean).join(" · ")}</div>
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
    {#if status === "offline"}
      <div class="panel px-4 py-3 text-[14px] text-fg-2" role="status">{t("No network: the computer was asleep or offline, and nothing was changed.")}{#if scheduled}{" "}{t("The schedule will run it again once the network is back.")}{/if}</div>
    {:else if status === "busy" && busy}
      <div class="panel px-4 py-3 text-[14px] text-fg-2" role="status">{t("The model was busy ({model} said {reason}) through every retry, and nothing was changed.", { model: busy.model, reason: reasonLabel(busy.reason) })}{#if scheduled}{" "}{t("The schedule tries again in ten minutes.")}{/if}</div>
    {:else if status === "parked"}
      <div class="panel px-4 py-3 text-[14px] text-fg-2" role="status">{t("Waiting for your answer in the inbox. The run picks up right where it stopped once you decide; nothing is held open meanwhile.")}</div>
    {:else if status === "error"}
      <div class="panel px-4 py-3 text-[14px]" role="alert" style="border-color: color-mix(in oklab, var(--color-bad) 35%, var(--color-line))">{#if quota}{@const q = quota}{t("Gemini's daily limit for {model} is used up; it resets {when}. Add billing to the key, or switch the model.", { model: q.model, when: until(q.retryAt) })}{:else}{plainTimes(String(end?.event["summary"] ?? ""))}{/if}</div>
    {/if}
    {#if doc}
      <article class="panel-raised rise p-5">
        <div class="mono mb-3 text-[11px] text-mute">{doc.path.split("/").pop()}</div>
        <div class="md space-y-2 text-[14.5px] leading-relaxed">{@html renderMarkdown(plainTimes(doc.content), { breaks: true })}</div>
      </article>
    {/if}
    {#if reply && status !== "error" && status !== "offline" && status !== "busy"}
      <div class="panel rise p-4">
        <div class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("What it said")}</div>
        <div class="md space-y-2 text-[14px] text-fg-2">{@html renderMarkdown(plainTimes(reply))}</div>
      </div>
    {/if}
    <details class="panel" bind:open={steps}>
      <summary class="cursor-pointer px-4 py-3 text-[13.5px] text-fg-2">{t("How it was made")} <span class="text-mute">· {t("{n} steps", { n: events.length })}</span></summary>
      <div class="border-t hairline p-4"><Timeline {events} /></div>
    </details>
  {/if}
</section>
