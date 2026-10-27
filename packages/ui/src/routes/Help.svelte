<script lang="ts">
  /** What each screen does and the three rules, in the words of the intro. Static on purpose: it works offline. */
  import { href } from "../lib/router.svelte";
  import { isApp } from "../lib/server.svelte";
  import { SUPPORT_EMAIL } from "../lib/support";
  import { t } from "../lib/i18n.svelte";
  const sections: { title: string; body: string[] }[] = $derived([
    { title: t("What Garu is"), body: [
      t("Garu runs small AI agents on your own computer, on a schedule, under rules you wrote. An agent is one file: who it is, which model it thinks with, when it runs, which tools it has, and what each tool may do."),
      isApp ? t("This app is the control room on your phone. It shows what your agents did, lets you approve what they ask, and lets you talk to them. Garu itself runs on your computer.") : t("This is the control room: what your agents did, what they ask, and a thread with each of them."),
    ] },
    { title: t("The three rules"), body: [
      t("Every tool call passes through the agent's policy. The first rule that matches wins. A call that matches no rule asks you; nothing is ever allowed by accident."),
      t("An ask pauses the run and lands in the inbox. Approve it once, approve it for 24 hours, or decline, with a note the agent reads before its next step."),
      t("Silence is a no. An ask nobody answers expires after 30 minutes and the agent is told."),
    ] },
    { title: t("The screens"), body: [
      t("Home: what's waiting on you, what fires next, and what happened today."),
      t("Inbox: actions paused on an ask. Each shows what it is: a file with the change it would make, a message with its text."),
      t("Agents: every agent, its schedule and what it may touch. Open one to read its diary, message it, or run it now."),
      t("Runs: every run, grouped by day. Open one to replay it step by step: each model turn, each tool call, each decision."),
      t("Settings: this device, how it's paired, and the advanced details of the control room."),
    ] },
    { title: t("Approvals that learn"), body: [
      t("Approve for 24h creates a grant: this agent, this tool, and when the call names a file or an address, only that one, until tomorrow. The card says what it would cover. Grants are listed in the inbox and can be revoked."),
      t("Approve the same thing three times and Garu proposes the exact rule, scoped to what you approved. Add it to the agent's file in one tap, or dismiss it."),
    ] },
    { title: t("Pairing and security"), body: [
      t("The phone talks to Garu over Tailscale, a private network between your own devices. Nothing is opened to the internet."),
      t("The pairing code is a key: anyone who scans it can approve as you. If it was ever shown to someone, make a new one from the control room on your computer; every phone then has to pair again."),
      t("Everything lives on your computer as plain files. There is no Garu account and no Garu server."),
    ] },
    { title: t("When something looks wrong"), body: [
      t("\"Schedules are off\": Garu is running without its schedules. On your computer, set Garu to start at login (Settings → Advanced there shows how) and they run from then on."),
      t("\"Needs setup on your computer\": the agent references a key or a sign-in that isn't there yet. Finish it in the control room on that computer."),
      t("\"Reconnecting…\": the phone can't reach your computer. Check that it's awake and that Tailscale is on, on both ends."),
      t("A run shown as interrupted was killed before it finished, usually because Garu was stopped while it was waiting on you."),
    ] },
  ]);
</script>

<section class="mx-auto max-w-2xl space-y-6">
  <div class="rise"><h1 class="title">{t("Help")}</h1></div>
  {#each sections as s (s.title)}
    <div class="rise">
      <h2 class="mb-1.5 text-[15px] font-semibold">{s.title}</h2>
      <div class="space-y-2 text-[14px] leading-relaxed text-fg-2">{#each s.body as p}<p>{p}</p>{/each}</div>
    </div>
  {/each}
  <div class="rise flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
    <a class="inline-flex min-h-11 items-center underline hover:text-fg" href={href("about")}>{t("About Garu")}</a>
    <a class="inline-flex min-h-11 items-center underline hover:text-fg" href={href("report")}>{t("Report a problem")}</a>
    {#if SUPPORT_EMAIL}<a class="inline-flex min-h-11 items-center underline hover:text-fg" href="mailto:{SUPPORT_EMAIL}">{t("Email {email}", { email: SUPPORT_EMAIL })}</a>{/if}
    <a class="inline-flex min-h-11 items-center underline hover:text-fg" href="https://github.com/humbertovillanueva/garu/blob/main/docs/why.md" target="_blank" rel="noreferrer">{t("Why Garu")} <span aria-hidden="true">↗</span><span class="sr-only">{t("(opens in a new tab)")}</span></a>
  </div>
</section>
