<script lang="ts">
  import { api, live, loader, agentByName } from "../lib/api.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, clock, dayLabel, statusLabel, statusLine, until, cronLabel, humanTime, plainTimes } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import SuggestionCard from "../lib/components/SuggestionCard.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import type { FeedItem, ApprovalRequest, TodayResponse } from "../lib/types";
  import { isApp } from "../lib/server.svelte";
  import { renderMarkdown } from "../lib/md";
  import { t, parts } from "../lib/i18n.svelte";
  import { ticker } from "../lib/clock.svelte";

  let feed = $state<FeedItem[] | null>(null);
  let feedError = $state<string | null>(null);
  // What the agents produced lately (a brief, a sorted inbox) and the week in numbers.
  let today = $state<TodayResponse | null>(null);
  const load = loader();
  const loadToday = loader();
  $effect(() => { live.tick; load(api.feed(60), (f) => { feed = f; feedError = null; }, (m) => (feedError = m)); });
  $effect(() => { live.tick; loadToday(api.today(), (r) => (today = r), () => {}); });

  // Follows the shared clock: a page left open overnight says good morning in the morning.
  const greeting = $derived.by(() => { const hour = new Date(ticker.now).getHours(); return hour < 5 ? t("Still up") : hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening"); });
  const runsToday = $derived(live.agents.reduce((s, a) => s + a.runsToday, 0));
  const spendToday = $derived(live.agents.reduce((s, a) => s + a.costTodayUsd, 0));
  const working = $derived(live.agents.filter((a) => a.status === "working"));
  const needsSetup = $derived(live.agents.filter((a) => a.status === "needs-setup"));
  const signInSoon = $derived(live.agents.filter((a) => a.signInExpiring?.length));
  const totalRuns = $derived(live.agents.reduce((s, a) => s + a.runs, 0));
  const scheduled = $derived(live.agents.filter((a) => a.cron && a.status !== "needs-setup").length);
  // First week: show the way in until there's real history.
  const firstRun = $derived(live.loaded && totalRuns < 3);

  // What fires next, across every scheduled agent, soonest first; one waiting on you still has its next run.
  const comingUp = $derived(live.agents.filter((a) => a.nextRun && a.status !== "needs-setup" && !a.needs.length && !a.signIn.length).sort((a, b) => a.nextRun!.localeCompare(b.nextRun!)).slice(0, 6));
  const week = $derived(today?.week ?? null);

  // Feed minus pending approvals (they get their own cards up top), grouped by day. An agent that
  // finished several runs in a row with the same outcome takes one line, so a heartbeat doesn't bury the day.
  type Row = { items: FeedItem[] };
  const groups = $derived.by(() => {
    const items = (feed ?? []).filter((i) => i.kind !== "approval.pending" && i.kind !== "run.start");
    const out: { day: string; rows: Row[] }[] = [];
    for (const i of items) {
      const day = dayLabel(i.ts);
      let g = out.at(-1);
      if (!g || g.day !== day) { g = { day, rows: [] }; out.push(g); }
      const last = g.rows.at(-1);
      const prev = last?.items[0];
      if (prev && prev.agent === i.agent && prev.kind === i.kind && i.kind.startsWith("run.")) last.items.push(i);
      else g.rows.push({ items: [i] });
    }
    return out;
  });
  const oneLine = (s: string) => plainTimes(s).replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  const kindColor = (k: string) => k === "run.ok" ? "var(--color-ok)" : k.startsWith("run.") ? "var(--color-bad)" : "var(--color-mute)";
</script>

<section class="space-y-8">
  <div class="rise">
    <h1 class="text-[26px] font-semibold tracking-tight">{greeting}.</h1>
    <p class="mt-1 text-[14px] text-fg-2" aria-live="polite">
      {#if !live.loaded}{t("Loading your agents…")}
      {:else if live.pending.length === 1}{#each parts("{n} decision is waiting for you.", { n: 1 }) as p}{#if p.name}<span class="font-medium text-fg">{p.text}</span>{:else}{p.text}{/if}{/each}
      {:else if live.pending.length}{#each parts("{n} decisions are waiting for you.", { n: live.pending.length }) as p}{#if p.name}<span class="font-medium text-fg">{p.text}</span>{:else}{p.text}{/if}{/each}
      {:else if working.length}{working.length === 1 ? t("{names} is working right now.", { names: working[0]!.name }) : t("{names} are working right now.", { names: working.map((a) => a.name).join(", ") })}
      {:else if runsToday}{runsToday === 1 ? t("1 run today from {active} of your {total} agents, {cost} estimated. Nothing needs you.", { active: live.agents.filter((a) => a.runsToday).length, total: live.agents.length, cost: usd(spendToday) }) : t("{n} runs today from {active} of your {total} agents, {cost} estimated. Nothing needs you.", { n: runsToday, active: live.agents.filter((a) => a.runsToday).length, total: live.agents.length, cost: usd(spendToday) })}
      {:else if !live.up && scheduled}{t("Nothing has run today, and nothing will: schedules are off.")}
      {:else}{t("Quiet so far today. Nothing needs you.")}{/if}
    </p>
  </div>

  {#if live.loaded}
    <div class="rise space-y-2">
      {#if !live.up}
        <div class="panel flex items-center gap-3 px-4 py-3 text-[13.5px]" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line))">
          <span class="dot" style="background: var(--color-ask)"></span>
          <div class="min-w-0"><div class="font-medium">{t("Schedules are off")}</div><div class="text-[12.5px] text-fg-2">{isApp ? t("Garu on your computer is running, but not its schedules. Start it there with the login service.") : t("Start Garu with --up, or install the login service, and the schedules below will fire.")}</div></div>
        </div>
      {/if}
    </div>
  {/if}

  {#if firstRun && !isApp}
    <div class="panel-raised rise p-5">
      <div class="mb-1 text-[15px] font-semibold">{t("Welcome. Three steps to your first agent.")}</div>
      <p class="mb-4 text-[13.5px] text-fg-2">{t("Garu runs agents that can only act through a policy you wrote. Nothing happens without a rule allowing it, or you approving it.")}</p>
      <ol class="grid gap-3 text-[13.5px] sm:grid-cols-3">
        {#if agentByName("pip")}
          <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">1</div><div class="font-medium">{t("Run pip")}</div><div class="mt-0.5 text-fg-2">{#each parts("Open {agent} and press {button}.", { agent: "pip", button: t("Run now") }) as p}{#if p.name === "agent"}<a class="underline hover:text-fg" href={href("agent", "pip")}>{p.text}</a>{:else if p.name === "button"}<span class="font-medium text-fg">{p.text}</span>{:else}{p.text}{/if}{/each} {t("It reads a notes file and asks before writing a summary.")}</div></li>
        {:else}
          <!-- pip only shows up when examples/ sits under this Garu folder; say where it lives instead of linking to nothing. -->
          <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">1</div><div class="font-medium">{t("Run an example")}</div><div class="mt-0.5 text-fg-2">{#each parts("pip, the example agent, lives in {path} in the Garu repository. Copy that folder under this one and it shows up here.", { path: "examples/pip" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each} {t("It reads a notes file and asks before writing a summary.")}</div></li>
        {/if}
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">2</div><div class="font-medium">{t("Approve it")}</div><div class="mt-0.5 text-fg-2">{t("The pause is the product. Approve once, approve for 24h, or decline with a note it reads.")}</div></li>
        <li class="rounded-lg border hairline bg-bg/40 p-3"><div class="mono mb-1 text-[11px] text-mute">3</div><div class="font-medium">{t("Make your own")}</div><div class="mt-0.5 text-fg-2">{#each parts("{command} asks what it should do and writes a Garufile with a closed policy.", { command: "npm run garu -- new" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}</div></li>
      </ol>
    </div>
  {/if}

  {#if signInSoon.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Sign in again soon")}</h2>
      <div class="panel divide-y divide-line">
        {#each signInSoon as a (a.name)}
          <a href={href("agent", a.name)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
            <Mark name={a.name} size={26} status={a.status} />
            <span class="font-medium">{a.name}</span>
            <span class="min-w-0 text-[12.5px] [overflow-wrap:anywhere]" style="color: var(--color-ask)">{#each a.signInExpiring ?? [] as s, i}{i ? " · " : ""}{isApp ? t("Its {server} sign-in is {days} days old; Google ends it at 7. Sign in again on your computer.", { server: s.server, days: s.days }) : t("Its {server} sign-in is {days} days old; Google ends it at 7. Sign in again:", { server: s.server, days: s.days })}{#if !isApp} <span class="mono">npm run garu -- auth {a.source} {s.server}</span>{/if}{/each}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  {#if needsSetup.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Needs setup")}</h2>
      <div class="panel divide-y divide-line">
        {#each needsSetup as a (a.name)}
          <a href={href("agent", a.name)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
            <Mark name={a.name} size={26} status={a.status} />
            <span class="font-medium">{a.name}</span>
            <span class="min-w-0 text-[12.5px] [overflow-wrap:anywhere]" style="color: var(--color-ask)">{isApp ? t("needs setup on your computer") : [...a.needs.map((v) => t("add {name} to .env", { name: v })), ...a.signIn.map((s) => `npm run garu -- auth ${a.source} ${s}`)].join(" · ")}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  {#if live.pending.length || live.suggestions.length}
    <div class="space-y-3">
      <h2 class="text-[11px] uppercase tracking-wider text-mute">{t("Needs you")}</h2>
      {#each live.pending as r (r.id)}<ReviewCard req={r} />{/each}
      {#each live.suggestions.slice(0, 2) as s (s.id)}<SuggestionCard {s} />{/each}
    </div>
  {/if}

  {#if today?.results.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Latest from your agents")}</h2>
      <div class="grid gap-3 md:grid-cols-2">
        {#each today.results.slice(0, 4) as r (r.agent + r.runId)}
          {@const waiting = live.pending.filter((p) => p.agent === r.agent).length}
          <div class="panel-raised rise flex min-w-0 flex-col p-4">
            <div class="flex items-center gap-3">
              <Mark name={r.agent} size={30} />
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium">{r.agent}</div>
                <div class="text-[12px] text-mute">{humanTime(r.endedAt)}</div>
              </div>
            </div>
            {#if r.summary}<div class="md result mt-3 space-y-1 text-[13.5px] text-fg-2">{@html renderMarkdown(plainTimes(r.summary), { breaks: true })}</div>{/if}
            {#if r.doc}
              <!-- The document it wrote (Tomay's brief), the top of it; the rest is one tap away. -->
              <div class="doc relative mt-3 overflow-hidden rounded-lg border hairline bg-bg/60 px-3 py-2">
                <div class="md space-y-1 text-[13px]">{@html renderMarkdown(plainTimes(r.doc.content), { breaks: true })}</div>
              </div>
            {/if}
            <div class="mt-auto flex flex-wrap gap-x-4 pt-3 text-[12.5px]">
              <a class="tap text-fg-2 underline decoration-mute underline-offset-2 hover:text-fg" href={href("run", r.agent, r.runId)}>{r.doc ? t("Read it all") : t("See the run")}</a>
              {#if waiting}<a class="tap underline decoration-mute underline-offset-2" style="color: var(--color-ask)" href={href("inbox")}>{waiting === 1 ? t("1 waiting for you") : t("{n} waiting for you", { n: waiting })}</a>{/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if working.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Right now")}</h2>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each working as a (a.name)}
          <a href={href("agent", a.name)} class="panel card-hover rise flex items-center gap-3 px-3 py-2.5">
            <Mark name={a.name} size={30} status={a.status} />
            <div class="min-w-0">
              <div class="truncate text-[14px] font-medium">{a.name}</div>
              <div class="truncate text-[12.5px] text-fg-2">{statusLine(a)}</div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  {#if live.up && comingUp.length}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Coming up")}</h2>
      <div class="flex flex-wrap gap-2">
        {#each comingUp as a (a.name)}
          <a href={href("agent", a.name)} class="chip card-hover tap gap-2 py-1 pl-1 pr-3" title={a.description || cronLabel(a.cron)}>
            <Mark name={a.name} size={20} />
            <span class="text-fg">{a.name}</span><span>{until(a.nextRun)}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  {#if week && week.runs}
    <div>
      <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("This week")}</h2>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {#each [[t("Runs"), String(week.runs)], [t("Done without asking"), String(week.actions)], [t("Asked you"), String(week.asked)], [t("Spent"), usd(week.costUsd, week.priced)]] as [label, value] (label)}
          <div class="panel px-3 py-2.5">
            <div class="text-[12px] text-mute">{label}</div>
            <div class="mt-0.5 text-[20px] font-semibold tracking-tight tabular-nums">{value}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div>
    <h2 class="mb-2 text-[11px] uppercase tracking-wider text-mute">{t("Activity")}</h2>
    {#if feed === null}
      {#if feedError}<LoadError message={feedError} />{:else}<Skeleton rows={4} h={52} />{/if}
    {:else if groups.length === 0}
      <Empty title={t("Nothing has happened yet")} hint={isApp ? t("When an agent runs, what it did shows up here.") : t("Run one with npm run garu -- run examples/pip/Garufile.yaml in your Garu folder.")}>
        {#if live.agents.length}<p class="text-[13px] text-fg-2">{t("Or open an agent in Agents and press Run now.")}</p>{/if}
      </Empty>
    {:else}
      {#each groups as g (g.day)}
        <div class="mb-5">
          <div class="mb-2 text-[11px] uppercase tracking-wider text-mute">{g.day}</div>
          <div class="panel divide-y divide-line">
            {#each g.rows as row (row.items[0]!.ts + row.items[0]!.kind + row.items[0]!.runId)}
              {@const i = row.items[0]!}
              {@const n = row.items.length}
              {@const d = i.detail as ApprovalRequest | undefined}
              <a href={n === 1 ? href("run", i.agent, i.runId) : href("agent", i.agent)} class="card-hover flex items-center gap-3 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
                <Mark name={i.agent} size={26} />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 text-[13.5px]">
                    <span class="font-medium">{i.agent}</span>
                    {#if n > 1}<span class="text-mute"><span aria-hidden="true">×</span><span class="sr-only">{t("times")}</span> {n}</span>{/if}
                    {#if i.kind.startsWith("run.")}
                      <span style="color: {kindColor(i.kind)}">{statusLabel(i.kind.slice(4))}</span>
                    {:else if i.kind === "approval.decided"}
                      <span class="text-fg-2">{d?.decision?.approved ? t("approved") : /expired/.test(d?.decision?.by ?? "") ? t("expired") : t("declined")}</span>
                    {/if}
                    <span class="ml-auto flex-none text-[12px] text-mute" title={humanTime(i.ts)}>{n === 1 ? clock(i.ts) : `${clock(row.items.at(-1)!.ts)} – ${clock(i.ts)}`}</span>
                  </div>
                  {#if i.kind === "approval.decided"}
                    <div class="truncate text-[12.5px] text-mute">{i.text}</div>
                  {:else if i.text && i.text !== i.kind.slice(4)}
                    <div class="truncate text-[12.5px] text-mute">{oneLine(i.text)}</div>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  /* A result reads at a glance: a few lines of summary, the top of its document, the rest one tap away. */
  .result { max-height: 7.5rem; overflow: hidden; }
  .doc { max-height: 13rem; }
  .doc::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2.5rem; background: linear-gradient(transparent, var(--color-panel)); pointer-events: none; }
</style>
