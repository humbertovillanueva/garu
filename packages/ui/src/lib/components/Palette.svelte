<script lang="ts">
  // Jump anywhere with the keyboard: ⌘K (Ctrl K elsewhere) opens a box; a few letters of an agent's name
  // or a page's land there. Desktop only; the phone has its tabs.
  import { tick } from "svelte";
  import { live } from "../api.svelte";
  import { href } from "../router.svelte";
  import { t } from "../i18n.svelte";
  import Mark from "./Mark.svelte";

  type Item = { id: string; label: string; hint: string; to: string; agent?: { name: string; status: string } };

  let open = $state(false);
  let q = $state("");
  let cursor = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  const pages = $derived<Item[]>([
    { id: "page:home", label: t("Home"), hint: t("what needs you, what happened"), to: href("home") },
    { id: "page:inbox", label: t("Inbox"), hint: t("the asks waiting for you"), to: href("inbox") },
    { id: "page:agents", label: t("Agents"), hint: t("every agent at a glance"), to: href("agents") },
    { id: "page:runs", label: t("Runs"), hint: t("every run, searchable"), to: href("runs") },
    { id: "page:cost", label: t("Cost"), hint: t("what the agents cost"), to: href("cost") },
    { id: "page:new", label: t("New agent"), hint: t("a few questions, then a Garufile"), to: href("new") },
    { id: "page:settings", label: t("Settings"), hint: t("the control room's facts"), to: href("settings") },
  ]);
  /** A match: the letters typed appear in order ("tm" finds tomay), or anywhere in the hint. */
  const matches = (label: string, hint: string, needle: string) => {
    const l = label.toLowerCase();
    if (l.includes(needle) || hint.toLowerCase().includes(needle)) return true;
    let k = 0;
    for (const ch of l) if (ch === needle[k]) k++;
    return k === needle.length;
  };
  const items = $derived.by(() => {
    const agents: Item[] = live.agents.map((a) => ({ id: `agent:${a.name}`, label: a.name, hint: a.description, to: href("agent", a.name), agent: { name: a.name, status: a.status } }));
    const all = [...agents, ...pages];
    const needle = q.trim().toLowerCase();
    return (needle ? all.filter((i) => matches(i.label, i.hint, needle)) : all).slice(0, 12);
  });
  const active = $derived(items[cursor]);

  function go(i: Item) {
    open = false;
    q = "";
    location.hash = i.to;
  }
  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open = !open;
      if (open) { q = ""; cursor = 0; void tick().then(() => input?.focus()); }
    } else if (open && e.key === "Escape") {
      e.preventDefault();
      open = false;
    }
  }
  function onInputKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); cursor = Math.min(items.length - 1, cursor + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cursor = Math.max(0, cursor - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const i = items[cursor]; if (i) go(i); }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" style="background: rgba(0,0,0,.45)" role="presentation" onclick={() => (open = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="panel-raised w-full max-w-[560px] overflow-hidden" role="dialog" aria-modal="true" aria-label={t("Jump to")} tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <input bind:this={input} class="field !min-h-[52px] !rounded-none !border-0 !border-b hairline !text-[15px]" placeholder={t("An agent or a page; Esc closes")} aria-label={t("Jump to")} bind:value={q} oninput={() => (cursor = 0)} onkeydown={onInputKey} role="combobox" aria-expanded="true" aria-controls="jump-list" aria-activedescendant={active ? `jump-${active.id}` : undefined} aria-autocomplete="list" autocomplete="off" spellcheck="false" />
      <ul id="jump-list" role="listbox" class="max-h-[50vh] overflow-y-auto py-1">
        {#each items as i, k (i.id)}
          <li id={`jump-${i.id}`} role="option" aria-selected={k === cursor}>
            <button type="button" class="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px]" class:bg-panel-3={k === cursor} tabindex="-1" onmouseenter={() => (cursor = k)} onclick={() => go(i)}>
              {#if i.agent}<Mark name={i.agent.name} size={22} status={i.agent.status} />{:else}<span class="w-[22px] text-center text-mute" aria-hidden="true">→</span>{/if}
              <span class="min-w-0 flex-1 truncate">{i.label}</span>
              <span class="min-w-0 max-w-[55%] truncate text-[12px] text-mute">{i.hint}</span>
            </button>
          </li>
        {:else}
          <li class="px-4 py-3 text-[13px] text-mute">{t("Nothing matches.")}</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
