<script lang="ts">
  import { api, live, agentByName, loader, refreshCore, errorText } from "../lib/api.svelte";
  import { scrollBehavior } from "../lib/a11y.svelte";
  import LoadError from "../lib/components/LoadError.svelte";
  import { href } from "../lib/router.svelte";
  import { usd, humanTime, statusLine, runStatus, until, duration, cronLabel, triggerLabel, plainTimes, dayLabel } from "../lib/format";
  import Mark from "../lib/components/Mark.svelte";
  import Status from "../lib/components/Status.svelte";
  import Budget from "../lib/components/Budget.svelte";
  import Timeline from "../lib/components/Timeline.svelte";
  import ReviewCard from "../lib/components/ReviewCard.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import Empty from "../lib/components/Empty.svelte";
  import Thread from "../lib/components/Thread.svelte";
  import type { ChatMessage, Envelope, RunSummary, MemoryNote, ToldNote } from "../lib/types";
  import { tick } from "svelte";
  import { isApp } from "../lib/server.svelte";
  import Icon from "../lib/components/Icon.svelte";
  import { t, parts } from "../lib/i18n.svelte";

  let { name }: { name: string } = $props();
  const a = $derived(agentByName(name));
  // "Sign in again": the tab is opened on the click (a browser only allows that), then pointed at the
  // address the control room answers with; the waiting ends when the live data shows the sign-in fresh.
  let signingIn = $state<string | null>(null);
  let signInError = $state("");
  async function signIn(server: string) {
    const tab = window.open("", "_blank");
    signInError = "";
    signingIn = server;
    try {
      const { url } = await api.signIn(name, server);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      tab?.close();
      signInError = errorText(e);
      signingIn = null;
    }
  }
  $effect(() => {
    if (signingIn && !(a?.signIn ?? []).includes(signingIn) && !(a?.signInExpiring ?? []).some((s) => s.server === signingIn)) signingIn = null;
  });
  const pending = $derived(live.pending.filter((p) => p.agent === name));

  let runs = $state<RunSummary[] | null>(null);
  let liveEvents = $state<Envelope[] | null>(null);
  let messages = $state<ChatMessage[] | null>(null);
  let note = $state("");
  // Two or three openers from the agent's own job, by its face: a tap fills the box, you send it.
  const chips = $derived.by((): string[] => {
    const k = a?.persona?.kind;
    if (k === "fox") return [t("What's on today?"), t("Who am I meeting, and what should I know?")];
    if (k === "bee") return [t("Anything that needs a reply?"), t("What came in overnight?")];
    if (k === "owl") return [t("How's the repo this week?"), t("Anything to worry about?")];
    if (k === "octopus") return [t("What's next on the backlog?"), t("What's blocked?")];
    if (k === "rabbit") return [t("Did I commit today?")];
    return [t("What did you do last time?"), t("What can you do?")];
  });
  let starting = $state(false);
  let error = $state<string | null>(null);
  let showAllRuns = $state(false);
  // The agent's notebook, shown only for a Garufile that gave it one. Reloaded with the rest after each run.
  let memory = $state<MemoryNote[] | null>(null);
  // The last notes you wrote on its asks: what you told it, beside what it remembers.
  let told = $state<ToldNote[]>([]);
  let newNote = $state("");
  let memoryBusy = $state(false);
  /** Your words on an ask, kept: a decline note becomes a standing instruction in the notebook. */
  async function keep(text: string) {
    if (memoryBusy || !a) return;
    memoryBusy = true; memoryError = null;
    try { memory = (await api.remember(a.name, text)).notes; }
    catch (e) { memoryError = errorText(e); } finally { memoryBusy = false; }
  }
  let memoryError = $state<string | null>(null);
  $effect(() => { live.tick; if (a?.memory) void api.memory(name).then((m) => { memory = m.notes; told = m.told ?? []; }, () => {}); });
  async function remember() {
    const text = newNote.trim();
    if (!text || memoryBusy) return;
    memoryBusy = true; memoryError = null;
    try { memory = (await api.remember(name, text)).notes; newNote = ""; } catch (e) { memoryError = (e as Error).message; } finally { memoryBusy = false; }
  }
  async function forget(text: string) {
    memoryError = null;
    try { memory = (await api.forget(name, text)).notes; } catch (e) { memoryError = (e as Error).message; }
  }
  let bottom = $state<HTMLDivElement | null>(null);
  const hasKeyboard = typeof window === "undefined" || !window.matchMedia("(hover: none)").matches;
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
  // What the phone says an unset-up agent is waiting on: one whole sentence per shape (a key, keys, sign-ins, or both).
  const setupLine = $derived.by(() => {
    if (!a) return "";
    const services = a.signIn.join(", ");
    if (a.needs.length && a.signIn.length) return a.needs.length === 1 ? t("It can't run until a key it needs is added and you sign in to {services}. Open Garu on that computer to finish.", { services }) : t("It can't run until keys it needs are added and you sign in to {services}. Open Garu on that computer to finish.", { services });
    if (a.needs.length) return a.needs.length === 1 ? t("It can't run until a key it needs is added. Open Garu on that computer to finish.") : t("It can't run until keys it needs are added. Open Garu on that computer to finish.");
    return t("It can't run until you sign in to {services}. Open Garu on that computer to finish.", { services });
  });
  // The message box grows with its text and shrinks back when it's cleared after a send.
  let box = $state<HTMLTextAreaElement | null>(null);
  $effect(() => { note; if (!box) return; box.style.height = "auto"; box.style.height = note ? `${Math.min(box.scrollHeight, 160)}px` : ""; });

  let loadError = $state<string | null>(null);
  const loadRuns = loader(), loadChat = loader();
  // The history shows five rows, so five (plus one in case the current run is among them) is all that
  // is fetched on every tick; "show all" asks for the whole history once.
  const RECENT = 5;
  // Change it from its page: schedule, runs a day, cap per run, notebook; the Garufile keeps its comments.
  let editing = $state(false);
  let form = $state({ cron: "", runs: "", cap: "", memory: false });
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  function startEdit() {
    form = { cron: a?.cron ?? "", runs: a?.budget?.maxRunsPerDay ? String(a.budget.maxRunsPerDay) : "", cap: a?.budget?.maxCostUsd ? String(a.budget.maxCostUsd) : "", memory: Boolean(a?.memory) };
    saveError = null; editing = true;
  }
  // The rules, edited in place: action and reason on each, a rule added or dropped; the Garufile keeps its comments.
  let editingRules = $state(false);
  let rules = $state<{ tool: string; action: "allow" | "ask" | "block"; reason: string; when?: Record<string, Record<string, unknown>>; index: number | null }[]>([]);
  let removed = $state<number[]>([]);
  let rulesError = $state<string | null>(null);
  let savingRules = $state(false);
  function startRules() {
    rules = (a?.policy?.list ?? []).map((r, index) => ({ tool: r.tool, action: r.action, reason: r.reason ?? "", ...(r.when ? { when: r.when } : {}), index }));
    removed = []; rulesError = null; editingRules = true;
  }
  const whenText = (w: Record<string, Record<string, unknown>>) => Object.entries(w).map(([k, p]) => `${k} ${Object.entries(p).map(([op, v]) => `${op} ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")}`).join("; ");
  async function saveRules() {
    if (savingRules || !a) return;
    savingRules = true; rulesError = null;
    try {
      const before = a.policy?.list ?? [];
      const edits: import("../lib/types").PolicyEdit[] = [];
      // Changes to rules that were there, by their old position; then removals from the bottom up; then additions by their new position.
      for (const r of rules) {
        if (r.index === null) continue;
        const old = before[r.index]!;
        const e: import("../lib/types").PolicyEdit = { op: "set", index: r.index };
        if (r.tool.trim() !== old.tool) e.tool = r.tool.trim();
        if (r.action !== old.action) e.action = r.action;
        if ((r.reason.trim() || null) !== (old.reason ?? null)) e.reason = r.reason.trim() || null;
        if (e.tool !== undefined || e.action !== undefined || e.reason !== undefined) edits.push(e);
      }
      for (const i of [...removed].sort((x, y) => y - x)) edits.push({ op: "remove", index: i });
      // After removals the survivors shift up; a new rule's position is where it sits in the edited list.
      rules.forEach((r, at) => { if (r.index === null) edits.push({ op: "add", index: at, rule: { tool: r.tool.trim(), action: r.action, ...(r.reason.trim() ? { reason: r.reason.trim() } : {}) } }); });
      if (!edits.length) { editingRules = false; return; }
      await api.editPolicy(a.name, edits);
      editingRules = false;
      live.tick++;
      void refreshCore().catch(() => {});
    } catch (e) { rulesError = errorText(e); } finally { savingRules = false; }
  }
  // Paused: kept on the schedule, skipped until resumed; written into the Garufile like the rest.
  let pausing = $state(false);
  async function togglePause() {
    if (pausing || !a) return;
    pausing = true;
    try { await api.editAgent(a.name, { paused: !a.paused }); live.tick++; void refreshCore().catch(() => {}); }
    catch (e) { saveError = errorText(e); } finally { pausing = false; }
  }
  async function save() {
    if (saving || !a) return;
    saving = true; saveError = null;
    try {
      await api.editAgent(a.name, { cron: form.cron.trim() || null, maxRunsPerDay: form.runs.trim() ? Number(form.runs) : null, maxCostUsd: form.cap.trim() ? Number(form.cap) : null, memory: form.memory });
      editing = false;
      live.tick++;
      void refreshCore().catch(() => {});
    } catch (e) { saveError = errorText(e); } finally { saving = false; }
  }
  $effect(() => { live.tick; name; loadRuns(api.runs(name, showAllRuns ? {} : { limit: RECENT + 1 }), (r) => (runs = r), (m) => (loadError = m)); });
  $effect(() => {
    live.tick; name;
    loadChat(api.chat(name), async (m) => {
      loadError = null;
      const first = messages === null;
      const grew = (messages?.length ?? 0) !== m.length;
      messages = m;
      // A new message scrolls into view; opening the page does not, so the page lands on the agent's name.
      if (grew && !first) { await tick(); bottom?.scrollIntoView({ behavior: scrollBehavior(), block: "end" }); }
    }, (m) => (loadError = m));
  });

  async function send() {
    const text = note.trim();
    if (!a || !text || starting) return;
    starting = true; error = null;
    try {
      await api.send(name, text);
      note = "";
      live.tick++;
    } catch (e) { error = (e as Error).message; } finally { starting = false; }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  }
  // While working or waiting, stream the current run's events into the live panel.
  const currentRunId = $derived(a?.inFlight?.runId ?? pending[0]?.runId ?? null);
  const loadLive = loader(); // newest answer wins: a slow older one can't shrink the timeline after a newer one grew it
  $effect(() => {
    live.tick;
    const id = currentRunId;
    if (!id) { liveEvents = null; return; }
    loadLive(api.run(name, id), (e) => (liveEvents = e), () => (liveEvents = null));
  });
  // Follow the run as it grows, unless the reader has scrolled up to study something.
  let seenLive = 0, seenPending = 0;
  $effect(() => {
    const n = liveEvents?.length ?? 0, p = pending.length;
    if (n <= seenLive && p <= seenPending) { seenLive = n; seenPending = p; return; }
    seenLive = n; seenPending = p;
    void tick().then(() => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 320;
      if (nearBottom || p > 0) bottom?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
    });
  });
  const liveCost = $derived.by(() => {
    const last = [...(liveEvents ?? [])].reverse().find((e) => e.event.type === "model.turn" && e.event["totalCostUsd"] !== undefined);
    return (last?.event["totalCostUsd"] as number | undefined) ?? 0;
  });

  async function run() {
    if (!a) return;
    starting = true; error = null;
    try {
      const r = await api.startRun(name, note.trim() || undefined);
      note = "";
      live.tick++;
      void r; // the live panel on this page shows the run
    } catch (e) { error = (e as Error).message; } finally { starting = false; }
  }
</script>

{#if !live.loaded}
  <Skeleton rows={3} h={80} />
{:else if !a}
  <Empty title={t("No agent called “{name}”", { name })} />
{:else}
  <section class="space-y-6">
    <!-- Header: the character -->
    <div class="rise flex items-start gap-4">
      <Mark name={a.name} size={52} status={a.status} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="title">{a.name}</h1>
          <Status status={a.status === "scheduled" ? "sleeping" : a.status} />
        </div>
        {#if a.persona?.tagline}<p class="mt-0.5 text-[14px] italic text-fg-2">“{a.persona.tagline}”</p>{/if}
        {#if a.description}<p class="mt-1 text-[14px] text-fg-2">{a.description}</p>{/if}
        <p class="mt-1 text-[13px] text-mute">{a.status === "needs-setup" ? (isApp ? t("Needs setup on your computer") : statusLine(a)) : statusLine(a)}</p>
        {#each a.signInExpiring ?? [] as s (s.server)}
          <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] [overflow-wrap:anywhere]" style="color: var(--color-ask)"><span>{isApp ? t("Its {server} sign-in is {days} days old; Google ends it at 7. Sign in again on your computer.", { server: s.server, days: s.days }) : t("Its {server} sign-in is {days} days old; Google ends it at 7.", { server: s.server, days: s.days })}</span>{#if !isApp}<button type="button" class="btn py-0.5 text-[12.5px]" disabled={signingIn === s.server} onclick={() => signIn(s.server)}>{signingIn === s.server ? t("Waiting for the other tab…") : t("Sign in again")}</button>{/if}</p>
        {/each}
        {#if signInError}<p class="mt-1 text-[13px]" style="color: var(--color-bad)">{signInError}</p>{/if}
      </div>
    </div>

    <!-- Facts: what it runs on, what it can touch, when, for how much -->
    {#if a.configured}
      {@const total = (a.policy?.allow ?? 0) + (a.policy?.ask ?? 0) + (a.policy?.block ?? 0) || 1}
      {@const [provider, modelName] = (a.model ?? "").includes("/") ? (a.model as string).split("/", 2) as [string, string] : ["", a.model ?? ""]}
      {@const policyText = t("{allow} allow · {ask} ask · {block} block", { allow: a.policy?.allow ?? "", ask: a.policy?.ask ?? "", block: a.policy?.block ?? "" })}
      <div class="rise facts">
        <div class="fact"><div class="k">{t("Runs")}</div><div class="v" title={a.cron ?? ""}>{a.cron ? cronLabel(a.cron) : t("when asked")}{#if a.nextRun && live.up}<span class="text-mute">&nbsp;· {t("next {until}", { until: until(a.nextRun) })}</span>{/if}</div></div>
        <div class="fact"><div class="k">{t("History")}</div><div class="v">{a.runs === 1 ? t("1 run") : t("{n} runs", { n: a.runs })}{#if a.runsToday}<span class="text-mute">&nbsp;· {t("{n} today", { n: a.runsToday })}</span>{/if}</div></div>
        <div class="fact"><div class="k">{t("Model")}</div><div class="v" title={a.model ?? ""}>{modelName}{#if provider}<span class="text-mute">&nbsp;· {provider}</span>{/if}</div></div>
        <div class="fact"><div class="k">{t("Tools")}</div><div class="v" title={a.tools.join(", ")}>{a.tools.length ? a.tools.join(" · ") : t("none")}</div></div>
        <div class="fact">
          <div class="k">{t("Policy")}</div>
          <div class="v flex items-center gap-2">
            <span class="policybar w-16 flex-none" title={policyText}>
              <span style="width: {((a.policy?.allow ?? 0) / total) * 100}%; background: var(--color-ok)"></span>
              <span style="width: {((a.policy?.ask ?? 0) / total) * 100}%; background: var(--color-ask)"></span>
              <span style="width: {((a.policy?.block ?? 0) / total) * 100}%; background: var(--color-bad)"></span>
            </span>
            <span class="text-[11.5px] leading-tight text-mute">{policyText}</span>
          </div>
        </div>
        <div class="fact"><div class="k">{t("Limits")}</div><div class="v">{a.budget?.maxCostUsd ? t("{cost} per run", { cost: usd(a.budget.maxCostUsd) }) : a.budget?.free ? t("free model") : t("no cap")}{#if a.budget?.maxRunsPerDay}<span class="text-mute">&nbsp;· {a.budget.maxRunsPerDay === 1 ? t("1 run a day") : t("{n} runs a day", { n: a.budget.maxRunsPerDay })}</span>{/if}<span class="text-mute">&nbsp;· {a.sandbox ? t("sandboxed, net {network}", { network: a.sandbox.network }) : t("no sandbox")}</span></div></div>
      </div>
      {#if !live.demo && a.configured}
        {#if editing}
          <div class="panel rise p-4">
            <h3 class="label mb-3">{t("Change {name}", { name: a.name })}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-[13px]"><span class="text-mute">{t("Schedule (cron; empty = only when asked)")}</span><input class="field mt-1 w-full" bind:value={form.cron} placeholder="0 8 * * 1-5" />{#if form.cron.trim()}<span class="mt-1 block text-[12px] text-mute">{cronLabel(form.cron.trim())}</span>{/if}</label>
              <label class="block text-[13px]"><span class="text-mute">{t("Runs a day at most (empty = no cap)")}</span><input class="field mt-1 w-full" inputmode="numeric" bind:value={form.runs} /></label>
              <label class="block text-[13px]"><span class="text-mute">{t("Cap per run, in dollars (empty = no cap)")}</span><input class="field mt-1 w-full" inputmode="decimal" bind:value={form.cap} /></label>
              <label class="flex items-center gap-3 text-[13px] sm:mt-6"><input type="checkbox" class="toggle" bind:checked={form.memory} /><span>{t("Keeps a notebook between runs")}</span></label>
            </div>
            {#if saveError}<p class="mt-2 text-[12.5px]" style="color: var(--color-bad)">{saveError}</p>{/if}
            <div class="mt-3 flex gap-2">
              <button class="btn btn-primary" disabled={saving} onclick={save}>{t("Save to the Garufile")}</button>
              <button class="btn" disabled={saving} onclick={() => (editing = false)}>{t("Cancel")}</button>
            </div>
            <p class="mt-2 text-[12px] text-mute">{t("The file keeps your comments. A new schedule starts right away; a notebook needs its garu.remember and garu.forget rules in the policy to be used.")}</p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <button class="tap text-[12px] text-mute hover:text-fg" onclick={startEdit}>{t("Change schedule, caps or notebook")}</button>
            {#if a.cron}<button class="tap text-[12px] text-mute hover:text-fg" disabled={pausing} onclick={togglePause}>{a.paused ? t("Resume the schedule") : t("Pause the schedule")}</button>{/if}
            {#if !editingRules}<button class="tap text-[12px] text-mute hover:text-fg" onclick={startRules}>{t("Change the rules")}</button>{/if}
          </div>
        {/if}
        {#if editingRules}
          <div class="panel rise p-4">
            <h3 class="label mb-1">{t("{name}'s rules", { name: a.name })}</h3>
            <p class="mb-3 text-[12.5px] text-mute">{t("The first rule that matches a call wins. A call no rule matches asks you.")}</p>
            <div class="space-y-2">
              {#each rules as r, i (r.index ?? `new-${i}`)}
                <div class="flex flex-wrap items-center gap-2 rounded-lg border hairline px-3 py-2 text-[13px]">
                  <span class="w-5 text-right text-mute tabular-nums">{i + 1}</span>
                  <input class="field mono min-w-0 flex-1 !min-h-[34px] !py-1 !text-[12.5px]" bind:value={r.tool} aria-label={t("tool")} />
                  <select class="field !min-h-[34px] !w-auto !py-1 !text-[13px]" bind:value={r.action} aria-label={t("action")}>
                    <option value="allow">{t("allow")}</option><option value="ask">{t("ask")}</option><option value="block">{t("block")}</option>
                  </select>
                  <button class="tap text-mute hover:text-fg" aria-label={t("Drop this rule")} title={t("Drop this rule")} onclick={() => { if (r.index !== null) removed = [...removed, r.index]; rules = rules.filter((_, k) => k !== i); }}>×</button>
                  {#if r.when}<span class="basis-full text-[12px] text-mute">{t("only when {condition}", { condition: whenText(r.when) })}</span>{/if}
                  <input class="field basis-full !min-h-[34px] !py-1 !text-[12.5px]" bind:value={r.reason} placeholder={t("reason, shown on the ask (optional)")} aria-label={t("reason")} />
                </div>
              {/each}
            </div>
            <!-- A new rule goes above a closing catch-all ("*"), where it can still win; otherwise at the end. -->
            <button class="btn mt-2 py-1 text-[13px]" onclick={() => { const at = rules.length && rules[rules.length - 1]!.tool.trim() === "*" ? rules.length - 1 : rules.length; rules = [...rules.slice(0, at), { tool: "", action: "ask", reason: "", index: null }, ...rules.slice(at)]; }}>{t("Add a rule")}</button>
            {#if rulesError}<p class="mt-2 text-[12.5px]" style="color: var(--color-bad)">{rulesError}</p>{/if}
            <div class="mt-3 flex gap-2">
              <button class="btn btn-primary" disabled={savingRules || rules.some((r) => !r.tool.trim())} onclick={saveRules}>{t("Save to the Garufile")}</button>
              <button class="btn" disabled={savingRules} onclick={() => (editingRules = false)}>{t("Cancel")}</button>
            </div>
            <p class="mt-2 text-[12px] text-mute">{t("A rule's conditions stay as written; edit the file for those. The next run uses the new rules.")}</p>
          </div>
        {/if}
      {/if}
    {/if}

    <!-- Memory -->
    {#if a.memory}
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-[11px] uppercase tracking-wider text-mute">{t("What it remembers")}</h2>
          {#if memory}<span class="text-[11.5px] text-mute">{memory.length === 1 ? t("1 note") : t("{n} notes", { n: memory.length })}</span>{/if}
        </div>
        {#if memory === null}
          <Skeleton rows={2} h={32} />
        {:else}
          <div class="panel divide-y divide-line">
            {#if memory.length === 0}<p class="px-3 py-2.5 text-[13px] text-mute">{t("Nothing yet. {name} writes a note here when it learns something worth keeping for later runs; you can add one too.", { name: a.name })}</p>{/if}
            {#each memory as n (n.text)}
              <div class="group flex items-start gap-3 px-3 py-2.5 text-[13.5px]">
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.text}</span>
                {#if n.at}<span class="flex-none pt-px text-[12px] text-mute">{dayLabel(n.at + "T12:00:00")}</span>{/if}
                {#if !live.demo}<button class="tap -my-1 flex-none px-1.5 text-mute hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" onclick={() => forget(n.text)} aria-label={t("Forget this note")} title={t("Forget this note")}>×</button>{/if}
              </div>
            {/each}
            {#if !live.demo}
              <form class="flex gap-2 px-3 py-2" onsubmit={(e) => { e.preventDefault(); void remember(); }}>
                <input class="field flex-1 !min-h-[36px] !py-1.5 !text-[13px]" placeholder={t("A note {name} should keep in mind", { name: a.name })} aria-label={t("A note {name} should keep in mind", { name: a.name })} bind:value={newNote} maxlength="240" />
                <button class="btn py-1 text-[12.5px]" disabled={!newNote.trim() || memoryBusy}>{t("Remember")}</button>
              </form>
            {/if}
          </div>
          {#if memoryError}<p class="mt-1 text-[12.5px]" style="color: var(--color-bad)">{memoryError}</p>{/if}
          {#if told.length}
            <!-- What you told it: the notes you wrote on its asks. It read each one; the ones that held became notebook lines. -->
            <h3 class="label mb-2 mt-5">{t("What you told it")}</h3>
            <ul class="space-y-1.5">
              {#each told as n (n.at + n.note)}
                <li class="flex items-start gap-3 text-[13px]">
                  <span class="min-w-0 flex-1 text-fg-2 [overflow-wrap:anywhere]">{#if n.edited?.length}{t("you changed the {fields} of {tool} before approving", { fields: n.edited.join(", "), tool: n.tool })}{#if n.note} <span class="italic">“{n.note}”</span>{/if}{:else}<span class="italic">“{n.note}”</span>{/if}</span>
                  <span class="flex-none text-[12px] text-mute">{n.approved ? t("approved") : t("declined")} · {humanTime(n.at)}</span>
                  {#if n.note && memory && !live.demo && !memory.some((m) => m.text === n.note)}<button class="tap flex-none text-[12px] text-mute hover:text-fg" disabled={memoryBusy} onclick={() => keep(n.note)}>{t("Keep as a note")}</button>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Conversation -->
    {#if messages === null}
      {#if loadError}<LoadError message={loadError} />{:else}<Skeleton rows={2} h={56} />{/if}
    {:else if messages.length === 0 && !currentRunId}
      <div class="rise rounded-xl border border-dashed hairline px-4 py-6 text-center text-[13.5px] text-fg-2">
        {#if a.configured}{t("Say hello to {name}, or tell it to run. Anything it does goes through its policy and shows up here.", { name: a.name })}{:else}{t("This agent has no Garufile here, so it can't be messaged — only its history is available.")}{/if}
      </div>
    {:else}
      <Thread agent={a.name} messages={messages ?? []} />
    {/if}

    <!-- Live run, inline in the thread -->
    {#if currentRunId && liveEvents}
      <div class="panel-raised rise p-4" style="border-color: color-mix(in oklab, var(--color-ask) 30%, var(--color-line-2))">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="dot pulse" style="background: var(--color-ask)"></span>
          <span class="text-[14px] font-medium" role="status">{a.status === "waiting" ? t("Paused for you") : t("Working")}</span>
          {#if a.inFlight}<span class="text-[12px] text-mute">{a.maxTurns ? t("turn {turn} of {max}", { turn: a.inFlight.turn, max: a.maxTurns }) : t("turn {turn}", { turn: a.inFlight.turn })}</span>{/if}
          <div class="ml-auto"><Budget spent={liveCost} cap={a.budget?.maxCostUsd ?? null} free={a.budget?.free ?? false} /></div>
        </div>
        <Timeline events={liveEvents} compact />
      </div>
    {/if}

    <!-- Needs you: right where the timeline stopped -->
    {#each pending as r (r.id)}<ReviewCard req={r} />{/each}

    <!-- Composer. While an approval is pending the review card is the input, so the composer steps aside. -->
    {#if a.configured && pending.length === 0 && a.status === "needs-setup"}
      <div class="panel-raised rise space-y-2 p-4 text-[13.5px] text-fg-2" style="border-color: color-mix(in oklab, var(--color-ask) 35%, var(--color-line-2))">
        {#if isApp}
          <div class="font-medium text-fg">{t("{name} needs setup on your computer", { name: a.name })}</div>
          <div>{setupLine}</div>
        {:else}
          <div class="font-medium text-fg">{t("{name} can't run yet", { name: a.name })}</div>
          {#if a.needs.length}<div>{#each parts("Add {keys} to {file}, then {command}.", { keys: a.needs.join(", "), file: ".env", command: "npm run garu -- service restart" }) as p}{#if p.name === "keys"}<span class="mono text-fg">{p.text}</span>{:else if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}</div>{/if}
          {#each a.signIn as srv}<div class="flex flex-wrap items-center gap-2">{#each parts("Sign in to {server} once.", { server: srv }) as p}{#if p.name}<span class="mono text-fg">{p.text}</span>{:else}{p.text}{/if}{/each}<button type="button" class="btn py-0.5 text-[12.5px]" disabled={signingIn === srv} onclick={() => signIn(srv)}>{signingIn === srv ? t("Waiting for the other tab…") : t("Sign in")}</button></div>{/each}
          {#if signInError}<div style="color: var(--color-bad)">{signInError}</div>{/if}
        {/if}
      </div>
    {:else if a.configured && pending.length === 0}
      {@const busy = a.status === "working" || a.status === "waiting"}
      <div class="panel-raised rise sticky p-2" style="bottom: calc(0.75rem + var(--tabbar))">
        {#if !note.trim() && !busy && !live.demo}
          <div class="mb-2 flex flex-wrap gap-1.5">{#each chips as c (c)}<button class="tap rounded-full border hairline px-3 py-1 text-[12.5px] text-fg-2 hover:text-fg" onclick={() => { note = c; box?.focus(); }}>{c}</button>{/each}</div>
        {/if}
        <div class="flex items-end gap-2">
          <textarea class="field min-h-[42px] flex-1 resize-none" rows="1" placeholder={busy ? (a.status === "working" ? t("{name} is working…", { name: a.name }) : t("Waiting for your decision above")) : hasKeyboard ? t("Message {name}  ({key}↵)", { name: a.name, key: modKey }) : t("Message {name}", { name: a.name })} aria-label={t("Message {name}", { name: a.name })} bind:value={note} bind:this={box} onkeydown={onKey} disabled={busy}></textarea>
          <button class="btn btn-primary grid h-11 w-11 flex-none place-items-center rounded-full p-0" disabled={starting || !note.trim() || busy || a.capped} onclick={send} aria-label={t("Send")}><Icon name="send" size={18} /></button>
        </div>
        <div class="mt-1.5 flex items-center gap-2 px-1">
          <button class="btn py-1 text-[12.5px]" disabled={starting || busy || a.capped} onclick={run} title={t("Run the agent's standing job now; a message above goes along as a note")}><span class="inline-flex items-center gap-1"><Icon name="play" size={13} /> {t("Run now")}</span></button>
          {#if error}<span class="text-[12.5px]" role="alert" style="color: var(--color-bad)">{error}</span>{/if}
        </div>
      </div>
    {/if}
    <div bind:this={bottom}></div>

    <!-- History -->
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-[11px] uppercase tracking-wider text-mute">{t("Runs")}</h2>
        {#if a.runs > RECENT}<button class="tap text-[11.5px] text-mute hover:text-fg" onclick={() => (showAllRuns = !showAllRuns)}>{showAllRuns ? t("show fewer") : t("show all {n}", { n: a.runs })}</button>{/if}
      </div>
      {#if runs === null}
        {#if loadError}<LoadError message={loadError} />{:else}<Skeleton rows={3} h={48} />{/if}
      {:else if runs.length === 0}
        <div class="text-[13px] text-mute">{t("No runs yet.")}</div>
      {:else}
        <div class="panel divide-y divide-line">
          {#each runs.filter((r) => r.runId !== currentRunId).slice(0, showAllRuns ? undefined : RECENT) as r (r.runId)}
            <a href={href("run", r.agent, r.runId)} class="card-hover flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl">
              <Status status={runStatus(r)} />
              <span class="text-[12.5px] text-fg-2">{humanTime(r.startedAt)}</span>
              <span class="text-[12px] text-mute">{triggerLabel(r.trigger)}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] text-fg-2">{plainTimes(r.summary ?? "")}</span>
              <span class="hidden text-[12px] text-mute sm:inline">{usd(r.costUsd, r.priced)}{r.endedAt ? ` · ${duration(r.startedAt, r.endedAt, r.parkedMs)}` : ""}</span>
              {#if r.toolCalls.ask || r.blocked?.length}
                <!-- Why, in a breath: the run page has the whole story; this is enough to know which runs to open. -->
                <span class="basis-full text-[12px] text-mute">{[r.toolCalls.ask ? (r.toolCalls.ask === 1 ? t("asked you once") : t("asked you {n} times", { n: r.toolCalls.ask })) : "", r.blocked?.length ? t("blocked: {list}", { list: r.blocked.join(", ") }) : ""].filter(Boolean).join(" · ")}</span>
              {/if}
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>
{/if}
