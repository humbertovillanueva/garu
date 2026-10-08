<script lang="ts">
  /** Shown when this browser has no session: the control room is on another computer (or login is required here). */
  import { api } from "../lib/api.svelte";
  let token = $state("");
  const focus = (el: HTMLInputElement) => { el.focus(); };
  let busy = $state(false);
  let error = $state<string | null>(null);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!token.trim() || busy) return;
    busy = true; error = null;
    try { await api.login(token.trim()); } catch (err) { error = (err as Error).message === "sign in" ? "That token is not right." : (err as Error).message; }
    busy = false;
  }
</script>

<div class="flex min-h-screen items-center justify-center px-5" style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom)">
  <form class="panel rise w-full max-w-sm p-6 sm:p-7" onsubmit={submit}>
    <div class="mb-5 flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" width="30" height="30" fill="none" aria-hidden="true"><path d="M52.5 20.5 A24 24 0 1 1 43 11.1" stroke="var(--color-accent)" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="32" r="11" fill="var(--color-accent)"/><circle cx="28.5" cy="28" r="3.2" fill="#fff" fill-opacity=".55"/></svg>
      <span class="text-[17px] font-semibold tracking-tight">Garu</span>
    </div>
    <h1 class="text-[20px] font-semibold tracking-tight">Sign in to your control room</h1>
    <p class="mt-2 text-[13.5px] leading-relaxed text-fg-2">
      Your agents run on the computer where <span class="mono">garu ui</span> is running. To use them from here, you need that computer's token.
    </p>
    <ol class="mt-3 space-y-1.5 text-[13px] text-fg-2">
      <li><span class="text-mute">Easiest:</span> on that computer, open <span class="font-medium text-fg">Settings → Your phone</span> and scan the code.</li>
      <li><span class="text-mute">Or:</span> paste the token from <span class="mono">.garu/ui-token</span> in your Garu folder.</li>
    </ol>
    <label class="mt-5 block">
      <span class="text-[11px] uppercase tracking-wider text-mute">Token</span>
      <input class="mono mt-1.5 w-full rounded-lg border hairline bg-bg px-3 py-2.5 text-[13px] outline-none focus:border-accent/60" type="password" autocomplete="off" spellcheck="false" placeholder="paste it here" bind:value={token} use:focus />
    </label>
    {#if error}<p class="mt-2 text-[12.5px]" style="color: var(--color-bad)">{error}</p>{/if}
    <button class="btn btn-primary mt-4 w-full" type="submit" disabled={busy || !token.trim()}>{busy ? "Signing in…" : "Sign in"}</button>
    <p class="mt-4 text-[11.5px] leading-relaxed text-mute">The token is like a key: anyone who has it can approve actions as you. It never leaves your devices.</p>
  </form>
</div>
