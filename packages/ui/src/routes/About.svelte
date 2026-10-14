<script lang="ts">
  import { SUPPORT_EMAIL } from "../lib/support";
  import { api, live } from "../lib/api.svelte";
  import { href } from "../lib/router.svelte";
  import Logo from "../lib/components/Logo.svelte";
  import { build, isApp, server } from "../lib/server.svelte";
  import { t, siteUrl } from "../lib/i18n.svelte";
  let version = $state<string | null | undefined>(undefined); // undefined while still asking
  $effect(() => { live.tick; api.settings().then((s) => (version = s.version)).catch(() => (version = null)); });
  import { humanTime } from "../lib/format";
  const [appVersion, commit, built] = build.split(" · ");
  const builtWhen = built ? humanTime(built.replace(" UTC", "Z").replace(" ", "T")) : "";
</script>

<section class="mx-auto max-w-2xl space-y-6">
  <div class="rise flex items-center gap-4">
    <Logo size={56} />
    <div>
      <h1 class="text-[24px] font-semibold tracking-tight">Garu</h1>
      <p class="text-[14px] text-fg-2">{t("Always-on agents you can actually trust.")}</p>
    </div>
  </div>
  <div class="panel rise divide-y divide-line text-[14px]">
    <div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{isApp ? t("This app") : t("This page")}</span><span class="text-right">{appVersion}{#if commit}<span class="text-mute">, {t("build {commit}", { commit })}</span>{/if}</span></div>
    {#if built}<div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{t("Built")}</span><span>{builtWhen}</span></div>{/if}
    <div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{t("Garu on your computer")}</span><span>{version === undefined ? t("checking…") : version ? t("version {version}", { version }) : t("not reachable")}</span></div>
    {#if isApp}<div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{t("Paired with")}</span><span class="truncate">{server.base.replace(/^https?:\/\//, "") || "—"}</span></div>{/if}
    <div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{t("License")}</span><span>{t("Apache-2.0, open source")}</span></div>
    <div class="flex justify-between gap-4 px-4 py-3"><span class="text-mute">{t("Made by")}</span><span>Humberto Villanueva, Salt Lake City</span></div>
  </div>
  <div class="panel rise divide-y divide-line text-[14px]">
    <a class="card-hover block px-4 py-3" href={siteUrl()} target="_blank" rel="noreferrer">{t("Website")} <span aria-hidden="true">↗</span><span class="sr-only">{t("(opens in a new tab)")}</span></a>
    <a class="card-hover block px-4 py-3" href="https://github.com/humbertovillanueva/garu" target="_blank" rel="noreferrer">{t("Source code")} <span aria-hidden="true">↗</span><span class="sr-only">{t("(opens in a new tab)")}</span></a>
    <a class="card-hover block px-4 py-3" href="https://garu-app.vercel.app/privacy.html" target="_blank" rel="noreferrer">{t("Privacy")} <span aria-hidden="true">↗</span><span class="sr-only">{t("(opens in a new tab)")}</span></a>
    <a class="card-hover block px-4 py-3" href={href("help")}>{t("Help")}</a>
    <a class="card-hover block px-4 py-3" href={href("report")}>{t("Report a problem")}</a>
    {#if SUPPORT_EMAIL}<a class="card-hover block px-4 py-3" href="mailto:{SUPPORT_EMAIL}">{t("Email support")}</a>{/if}
  </div>
  <p class="text-[12.5px] text-mute">{t("Garu runs your agents on your own computer. The app stores only the address and the pairing token of that computer, on this phone.")}</p>
</section>
