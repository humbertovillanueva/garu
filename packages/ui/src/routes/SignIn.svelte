<script lang="ts">
  import Logo from "../lib/components/Logo.svelte";
  /** Shown when this browser has no session: the control room is on another computer (or login is required here). */
  import { api } from "../lib/api.svelte";
  import { t, parts } from "../lib/i18n.svelte";
  let token = $state("");
  const focus = (el: HTMLInputElement) => { el.focus(); };
  let busy = $state(false);
  let error = $state<string | null>(null);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!token.trim() || busy) return;
    busy = true; error = null;
    try { await api.login(token.trim()); } catch (err) { error = (err as Error).message === "sign in" ? t("That token is not right.") : (err as Error).message; }
    busy = false;
  }
</script>

<div class="flex min-h-screen items-center justify-center px-5" style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom)">
  <form class="panel rise w-full max-w-sm p-6 sm:p-7" onsubmit={submit}>
    <div class="mb-5 flex items-center gap-2.5">
      <Logo size={30} />
      <span class="text-[17px] font-semibold tracking-tight">Garu</span>
    </div>
    <h1 class="text-[20px] font-semibold tracking-tight">{t("Sign in to your control room")}</h1>
    <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">
      {t("Your agents run on the computer where Garu is running. To use them from here, you need that computer's token.")}
    </p>
    <ol class="mt-3 space-y-1.5 text-[13px] text-fg-2">
      <li><span class="text-mute">{t("Easiest:")}</span> {#each parts("On that computer, open {settings}, press {button} and scan it.", { settings: t("Settings → Your phone & other devices"), button: t("Show pairing code") }) as p}{#if p.name === "settings"}<span class="font-medium text-fg">{p.text}</span>{:else if p.name === "button"}<em>{p.text}</em>{:else}{p.text}{/if}{/each}</li>
      <li><span class="text-mute">{t("Or:")}</span> {#each parts("Paste the token from {file} in your Garu folder.", { file: ".garu/ui-token" }) as p}{#if p.name}<span class="mono">{p.text}</span>{:else}{p.text}{/if}{/each}</li>
    </ol>
    <label class="mt-5 block">
      <span class="text-[11px] uppercase tracking-wider text-mute">{t("Token")}</span>
      <input class="field mono mt-1.5" type="password" autocomplete="off" spellcheck="false" placeholder={t("paste it here")} bind:value={token} use:focus />
    </label>
    {#if error}<p class="mt-2 text-[12.5px]" role="alert" style="color: var(--color-bad)">{error}</p>{/if}
    <button class="btn btn-primary mt-4 w-full" type="submit" disabled={busy || !token.trim()}>{busy ? t("Signing in…") : t("Sign in")}</button>
    <p class="mt-4 text-[11.5px] leading-relaxed text-mute">{t("The token is like a key: anyone who has it can approve actions as you. It never leaves your devices.")}</p>
  </form>
</div>
