<script lang="ts">
  // "New agent": the questions `garu new` asks, on a page. The control room writes the Garufile with a policy
  // that starts closed and schedules it; the phone only says to do this on the computer.
  import { api, errorText, refreshCore } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import { isApp } from "../lib/server.svelte";
  import Creature from "../lib/components/Creature.svelte";
  import Skeleton from "../lib/components/Skeleton.svelte";
  import type { NewAgentOptions } from "../lib/types";
  import { t } from "../lib/i18n.svelte";

  let opts = $state<NewAgentOptions | null>(null);
  let loadError = $state("");
  void api.newOptions().then((o) => (opts = o)).catch((e) => (loadError = errorText(e)));

  let task = $state("");
  let kind = $state("cat");
  let name = $state("");
  let nameTouched = $state(false);
  let tagline = $state("");
  let schedule = $state("manual");
  let cron = $state("0 9 * * *");
  let model = $state("");
  let web = $state(false);
  let hosts = $state("");
  let fs = $state(true);
  let fsPath = $state("");
  let fsWrite = $state(false);
  let webhook = $state(false);
  let webhookVar = $state("");
  let cap = $state("0.05");
  let runsPerDay = $state("");
  let memory = $state(false);
  let saving = $state(false);
  let error = $state("");

  // The suggested name follows the face until the person types one; the folder and the webhook name follow the name.
  $effect(() => { if (opts && !nameTouched) name = opts.kinds.find((k) => k.kind === kind)?.suggested ?? ""; });
  $effect(() => { if (opts && !model) model = opts.models[0]?.model ?? ""; });
  const dir = $derived(name ? `./agents/${name}/workspace` : "./agents/<name>/workspace");
  const free = $derived(opts?.models.find((m) => m.model === model)?.cap === null && Boolean(opts?.models.some((m) => m.model === model)));
  const nameOk = $derived(/^[a-z][a-z0-9-]*$/.test(name));
  const taken = $derived(Boolean(opts?.taken.includes(name)));

  async function make() {
    error = "";
    if (!task.trim()) { error = t("Say what it should do first."); return; }
    if (!nameOk) { error = t("The name is lowercase letters, digits and hyphens, starting with a letter."); return; }
    saving = true;
    try {
      const r = await api.createAgent({
        name, kind, task: task.trim(), ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
        schedule: schedule === "cron" ? { cron: cron.trim() } : schedule,
        model: model.trim(),
        web: web ? { hosts: hosts.split(",").map((h) => h.trim()).filter(Boolean) } : null,
        fs: fs ? { path: fsPath.trim() || dir, write: fsWrite ? "allow" : "ask" } : null,
        webhook: webhook ? { envVar: webhookVar.trim() || `${name.toUpperCase().replace(/-/g, "_")}_WEBHOOK_URL` } : null,
        maxCostUsd: free || cap.trim() === "" ? null : Number(cap),
        maxRunsPerDay: runsPerDay.trim() ? Number(runsPerDay) : null,
        memory,
      });
      await refreshCore();
      location.hash = href("agent", r.name);
    } catch (e) {
      error = errorText(e);
    } finally {
      saving = false;
    }
  }
</script>

<section class="space-y-5">
  <div class="rise">
    <h1 class="title">{t("New agent")}</h1>
    <p class="mt-1 text-[14px] text-fg-2">{t("A few questions, then a Garufile with a policy that starts closed: only the tools you name, writes ask first, everything else blocked.")}</p>
  </div>

  {#if isApp}
    <div class="panel p-4 text-[13.5px] text-fg-2">{t("Agents are made on your computer. Open Garu there to make one.")}</div>
  {:else if loadError}
    <div class="panel p-4 text-[13.5px]" style="color: var(--color-bad)">{loadError}</div>
  {:else if !opts}
    <Skeleton rows={6} h={56} />
  {:else}
    <form class="space-y-5" onsubmit={(e) => { e.preventDefault(); void make(); }}>
      <div class="panel rise space-y-4 p-4">
        <label class="block">
          <span class="label">{t("What should it do?")}</span>
          <textarea class="field mt-1 min-h-[88px] w-full" bind:value={task} placeholder={t("One or two sentences, like you'd brief a new hire.")}></textarea>
        </label>
        <div class="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <span class="label">{t("Its face")}</span>
            <div class="mt-1 flex flex-wrap gap-1.5">
              {#each opts.kinds as k (k.kind)}
                <button type="button" class="rounded-full p-0.5 ring-2 transition" class:ring-fg={kind === k.kind} class:ring-transparent={kind !== k.kind} title={k.label} aria-label={k.kind} aria-pressed={kind === k.kind} onclick={() => (kind = k.kind)}>
                  <Creature kind={k.kind} size={34} />
                </button>
              {/each}
            </div>
            <p class="mt-1 max-w-[320px] text-[12px] text-mute">{opts.kinds.find((k) => k.kind === kind)?.label}</p>
          </div>
          <div class="space-y-3">
            <label class="block">
              <span class="label">{t("Name")}</span>
              <input class="field mono mt-1 w-full" bind:value={name} oninput={() => (nameTouched = true)} spellcheck="false" />
              {#if name && !nameOk}<p class="mt-1 text-[12px]" style="color: var(--color-bad)">{t("The name is lowercase letters, digits and hyphens, starting with a letter.")}</p>
              {:else if taken}<p class="mt-1 text-[12px]" style="color: var(--color-ask)">{t("There is already an agent called {name}.", { name })}</p>{/if}
            </label>
            <label class="block">
              <span class="label">{t("One line of character (optional)")}</span>
              <input class="field mt-1 w-full" bind:value={tagline} placeholder={t("shown under its name")} />
            </label>
          </div>
        </div>
      </div>

      <div class="panel rise space-y-4 p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="label">{t("When should it run?")}</span>
            <select class="field mt-1 w-full" bind:value={schedule}>
              {#each opts.schedules as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
              <option value="cron">{t("a cron expression I'll type")}</option>
            </select>
            {#if schedule === "cron"}<input class="field mono mt-2 w-full" bind:value={cron} aria-label={t("Cron (minute hour day month weekday)")} spellcheck="false" />{/if}
          </label>
          <label class="block">
            <span class="label">{t("Which model?")}</span>
            <select class="field mt-1 w-full" bind:value={model}>
              {#each opts.models as m (m.model)}<option value={m.model}>{m.model} · {m.why}</option>{/each}
            </select>
          </label>
        </div>
      </div>

      <div class="panel rise space-y-3 p-4">
        <span class="label">{t("What may it touch?")}</span>
        <label class="flex items-start gap-2 text-[13.5px]"><input type="checkbox" class="mt-1" bind:checked={web} /><span>{t("Read from the web (APIs, pages).")}{#if web}<input class="field mt-1 w-full" bind:value={hosts} placeholder={t("hosts, comma-separated, e.g. api.github.com; empty reviews every fetch")} />{/if}</span></label>
        <label class="flex items-start gap-2 text-[13.5px]"><input type="checkbox" class="mt-1" bind:checked={fs} /><span>{t("A folder to work in.")}{#if fs}<input class="field mono mt-1 w-full" bind:value={fsPath} placeholder={dir} spellcheck="false" /><label class="mt-1 flex items-center gap-2 text-[13px] text-fg-2"><input type="checkbox" bind:checked={fsWrite} />{t("It may write there without asking each time (it still can't touch anything outside).")}</label>{/if}</span></label>
        <label class="flex items-start gap-2 text-[13.5px]"><input type="checkbox" class="mt-1" bind:checked={webhook} /><span>{t("Post to a Slack or Discord channel (always asks first).")}{#if webhook}<input class="field mono mt-1 w-full" bind:value={webhookVar} placeholder={`${name.toUpperCase().replace(/-/g, "_") || "AGENT"}_WEBHOOK_URL`} spellcheck="false" /><span class="mt-1 block text-[12px] text-mute">{t("The name of the .env variable that holds the webhook URL; add it there before it runs.")}</span>{/if}</span></label>
      </div>

      <div class="panel rise space-y-3 p-4">
        <span class="label">{t("Limits")}</span>
        <div class="grid gap-4 sm:grid-cols-2">
          {#if !free}
            <label class="block text-[13.5px]">{t("Cap per run, in dollars")}<input class="field mono mt-1 w-full" bind:value={cap} inputmode="decimal" /></label>
          {:else}
            <p class="text-[13px] text-mute">{t("A local model costs nothing, so there is no cap per run.")}</p>
          {/if}
          <label class="block text-[13.5px]">{t("Runs a day at most (empty = no cap)")}<input class="field mono mt-1 w-full" bind:value={runsPerDay} inputmode="numeric" /></label>
        </div>
        <label class="flex items-start gap-2 text-[13.5px]"><input type="checkbox" class="mt-1" bind:checked={memory} /><span>{t("Keep a notebook between runs (a few short notes it writes; you read and edit them on its page).")}</span></label>
      </div>

      {#if error}<p class="text-[13px]" style="color: var(--color-bad)">{error}</p>{/if}
      <div class="flex flex-wrap items-center gap-2">
        <button type="submit" class="btn btn-primary" disabled={saving || !task.trim() || !nameOk || taken}>{saving ? t("Writing…") : t("Make it")}</button>
        <a class="btn" href={href("agents")}>{t("Cancel")}</a>
        <span class="text-[12px] text-mute">{t("It writes agents/{name}/Garufile.yaml; edit it any time.", { name: name || "<name>" })}</span>
      </div>
    </form>
  {/if}
</section>
