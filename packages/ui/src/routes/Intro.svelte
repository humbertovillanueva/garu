<script lang="ts">
  import { KIND_COLOR } from "../lib/colors";
  /**
   * First launch of the app: a short splash, then five screens that answer the
   * questions a stranger has, in order, ending on the pairing screen itself.
   */
  import { onDestroy, onMount } from "svelte";
  import Logo from "../lib/components/Logo.svelte";
  import Creature from "../lib/components/Creature.svelte";
  import Pair from "./Pair.svelte";
  import { backHandlers, haptic } from "../lib/native";

  let { onDone, splash = true, alreadyPaired = false }: { onDone: () => void; splash?: boolean; alreadyPaired?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let phase = $state<"splash" | "slides">(splash ? "splash" : "slides");
  let i = $state(0);
  const LAST = 4;
  $effect(() => { if (phase === "splash") { const t = setTimeout(() => (phase = "slides"), 1700); return () => clearTimeout(t); } });

  function next() { if (i < LAST) { i++; void haptic("light"); } }
  function back() { if (i > 0) i--; }
  function skip() { i = LAST; }

  // Android's back gesture steps back through the tour instead of closing the app.
  const onBack = () => { if (phase !== "slides" || i === 0) return false; back(); return true; };
  onMount(() => { backHandlers.push(onBack); });
  onDestroy(() => { const k = backHandlers.indexOf(onBack); if (k >= 0) backHandlers.splice(k, 1); });

  // Swipe: only a clearly sideways swipe changes slides, and never one that starts in the link box or the camera.
  let x0 = 0;
  let y0 = 0;
  let ignore = false;
  const onStart = (e: TouchEvent) => {
    x0 = e.touches[0]!.clientX;
    y0 = e.touches[0]!.clientY;
    ignore = !!(e.target as HTMLElement | null)?.closest("input, textarea, video");
  };
  const onEnd = (e: TouchEvent) => {
    if (ignore) return;
    const dx = e.changedTouches[0]!.clientX - x0;
    const dy = e.changedTouches[0]!.clientY - y0;
    if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    if (dx < 0 && i < LAST) i++; else if (dx > 0 && i > 0) i--;
  };

  const agents = [
    { kind: "fox", name: "Tomay", when: "Weekdays · 7:00 AM", does: "Reads your calendar and your email, and writes a prep note for each meeting. It only reads." },
    { kind: "bee", name: "Bea", when: "Weekdays · 7:15 AM", does: "Sorts new mail into four labels and drafts the replies for you to approve. She can't send." },
  ] as const;
</script>

{#if phase === "splash"}
  <div class="splash">
    <Logo size={132} animate />
    <div class="word" aria-hidden="true">Garu</div>
  </div>
{:else}
  <div class="intro" role="region" aria-roledescription="carousel" aria-label="Introduction" ontouchstart={onStart} ontouchend={onEnd}>
    <div class="bar">
      {#if i > 0}<button class="-ml-3 min-h-11 px-3 text-[13px] text-fg-2" onclick={back}>Back</button>{:else}<span></span>{/if}
      {#if i < LAST}<button class="-mr-3 min-h-11 px-3 text-[13px] text-fg-2" onclick={skip}>Skip</button>{/if}
    </div>
    <p class="sr-only" aria-live="polite">Step {i + 1} of {LAST + 1}</p>

    <div class="slides" style="transform: translateX({-i * 100}%)">
      <section class="slide" inert={i !== 0} aria-roledescription="slide" aria-label="1 of {LAST + 1}">
        <Logo size={116} />
        <h1>Agents that work while you sleep. Under rules you wrote.</h1>
        <p>An agent is an AI helper with one job, a schedule and rules you wrote. Garu runs yours around the clock on your own computer. This app is the control room: see what they did, approve what they ask, talk to them.</p>
      </section>

      <section class="slide" inert={i !== 1} aria-roledescription="slide" aria-label="2 of {LAST + 1}">
        <h1>An agent is one file.</h1>
        <p>Who it is, which AI model it thinks with, when it runs, what it can reach, and what it's allowed to do. You can read it before you run it.</p>
        <div class="card yaml">
          <div class="file mono">agents/bea/Garufile.yaml, in plain words</div>
          <span class="k">name</span> <b>Bea</b>, a bee · <i>“Sorts the inbox so you don't have to.”</i><br>
          <span class="k">thinks with</span> Gemini 3.5 Flash-Lite<br>
          <span class="k">runs</span> weekdays at 7:15 AM<br>
          <span class="k">can reach</span> your Gmail<br>
          <span class="k">rules</span><br>
          <span class="rule">read and file mail <span class="r-allow">→ allow</span></span><br>
          <span class="rule">draft a reply <span class="r-ask">→ ask</span></span><br>
          <span class="rule">anything else <span class="r-block">→ block</span></span>
        </div>
      </section>

      <section class="slide" inert={i !== 2} aria-roledescription="slide" aria-label="3 of {LAST + 1}">
        <h1>Every action passes through your rules.</h1>
        <p>Allow runs. Ask pauses and comes to your phone. Block: it can't even try. If you don't answer in 30 minutes, the answer is no.</p>
        <div class="card rc">
          <div class="h">
            <span class="orb" style="background:{KIND_COLOR.bee}"><Creature kind="bee" size={22} /></span>
            <span class="min-w-0"><b>bea</b> wants to draft <b>an email</b> <span class="tag">create_draft</span><span class="why">a draft reply in your name · expires in 30 min</span></span>
          </div>
          <div class="body"><span class="lbl">To</span> Lena Ortiz<br><span class="lbl">Re</span> Homepage draft<br>Hi Lena, thanks for sending the draft. I'll get back to you on the pricing copy before our review…</div>
          <div class="btns"><span class="ok">Approve</span><span>Approve for 24h</span><span class="no">Decline</span></div>
        </div>
      </section>

      <section class="slide" inert={i !== 3} aria-roledescription="slide" aria-label="4 of {LAST + 1}">
        <h1>Meet two agents.</h1>
        <p>They come with Garu, and you can make your own on your computer. Each has a face, a schedule and rules you can read.</p>
        <div class="meet">
          {#each agents as a (a.name)}
            <div class="card agent">
              <span class="orb mid" style="background:{KIND_COLOR[a.kind]}"><Creature kind={a.kind} size={34} /></span>
              <div class="min-w-0">
                <div class="top"><b>{a.name}</b><span class="when">{a.when}</span></div>
                <div class="does">{a.does}</div>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section class="slide last" inert={i !== LAST} aria-roledescription="slide" aria-label="{LAST + 1} of {LAST + 1}">
        {#if alreadyPaired}
          <h1>You're connected.</h1>
          <p>This phone is already paired with your computer, so there's nothing to set up. That's the whole tour.</p>
        {:else}
          <h1>Connect to your computer.</h1>
          <p>Your agents live on the computer running Garu. Pair this phone once and it talks straight to that computer over your private network; there's no Garu server in between.</p>
          <ol class="steps">
            <li><i>1</i><span>On your computer, open Garu → <b>Settings → Your phone &amp; other devices</b>.</span></li>
            <li><i>2</i><span>Press <b>Show pairing code</b>, then scan it below, or copy the link there and paste it below.</span></li>
            <li><i>3</i><span>Both need <b>Tailscale</b> (free), signed in to the same account.</span></li>
            <li><i>4</i><span>Don't have Garu yet? <a class="link" href="https://humbertovillanueva.github.io/garu/" target="_blank" rel="noreferrer">The website ↗</a> walks you through setting it up on your computer.</span></li>
          </ol>
          <!-- only while this slide shows, so the camera never runs off-screen -->
          {#if i === LAST}<div class="w-full"><Pair embedded /></div>{/if}
        {/if}
      </section>
    </div>

    <div class="foot">
      <div class="dots" aria-hidden="true">{#each Array(LAST + 1) as _, d}<i class:on={d === i}></i>{/each}</div>
      {#if i < LAST}
        <button class="cta" onclick={next}>{i === 0 ? "How does it work?" : "Next"}</button>
      {:else if alreadyPaired}
        <button class="cta" onclick={onDone}>Done</button>
      {:else}
        <button class="min-h-11 px-4 text-[13px] text-mute" onclick={onDone}>Close the tour</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .splash { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: var(--color-fg); background: var(--color-bg); }
  .word { font-size: 22px; font-weight: 650; letter-spacing: -.02em; opacity: 0; animation: word .5s 1.1s forwards; }
  @keyframes word { to { opacity: 1; } }

  /* A fixed height: each slide scrolls on its own, so the button below is always on screen. */
  .intro { height: 100dvh; display: flex; flex-direction: column; background: var(--color-bg); overflow: hidden; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .bar { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px 0; min-height: 44px; }
  .slides { flex: 1; min-height: 0; display: flex; transition: transform .35s cubic-bezier(.2,.8,.2,1); }
  .slide { flex: 0 0 100%; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: safe center; gap: 16px; padding: 12px 28px 16px; text-align: center; overflow-y: auto; }
  .slide.last { justify-content: flex-start; padding-top: 24px; }
  /* nothing on a slide shrinks to fit; a tall slide scrolls instead */
  .slide > :global(*) { flex-shrink: 0; }
  h1 { font-size: 28px; line-height: 1.12; letter-spacing: -.03em; font-weight: 650; margin: 0; }
  p { margin: 0; color: var(--color-fg-2); font-size: 15px; line-height: 1.55; }
  .card { width: 100%; background: var(--color-panel); border: 1px solid var(--color-line); border-radius: 14px; text-align: left; overflow: hidden; }
  .yaml { padding: 12px 16px 14px; font-size: 13px; line-height: 1.75; color: var(--color-fg-2); } .yaml b { color: var(--color-fg); font-weight: 600; } .yaml .k { color: var(--color-mute); }
  .yaml .file { font-size: 11px; color: var(--color-mute); margin-bottom: 6px; overflow-wrap: anywhere; }
  .yaml .rule { padding-left: 14px; display: inline-block; }
  /* not .block: Tailwind's .block utility would put "→ block" on its own line */
  .r-allow { color: var(--color-ok); } .r-ask { color: var(--color-ask); } .r-block { color: var(--color-bad); }
  .rc { border-color: color-mix(in oklab, var(--color-ask) 40%, var(--color-line)); }
  .rc .h { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; font-size: 13.5px; line-height: 1.4; } .rc .h b { font-weight: 600; }
  .rc .why { display: block; margin-top: 2px; font-size: 12px; color: var(--color-mute); }
  .rc .body .lbl { color: var(--color-mute); display: inline-block; width: 22px; }
  .rc .body { margin: 0 14px; border: 1px solid var(--color-line); border-radius: 10px; background: color-mix(in oklab, var(--color-bg) 60%, transparent); font-size: 12px; color: var(--color-fg-2); padding: 10px 12px; line-height: 1.5; }
  .rc .btns { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 14px; } .rc .btns span { flex: 1 1 auto; min-width: 0; text-align: center; padding: 9px 6px; border-radius: 9px; border: 1px solid var(--color-line-2); font-size: 13px; white-space: nowrap; }
  .rc .btns .ok { border-color: color-mix(in oklab, var(--color-ok) 40%, transparent); color: var(--color-ok); } .rc .btns .no { border-color: color-mix(in oklab, var(--color-bad) 40%, transparent); color: var(--color-bad); }
  .orb { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  .orb.mid { width: 46px; height: 46px; }
  .meet { width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .agent { display: flex; gap: 12px; align-items: flex-start; padding: 14px; }
  .agent .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; } .agent b { color: var(--color-fg); font-weight: 600; font-size: 15px; }
  .agent .when { font-size: 12px; color: var(--color-mute); }
  .agent .does { margin-top: 3px; font-size: 13.5px; line-height: 1.5; color: var(--color-fg-2); }
  .steps { width: 100%; text-align: left; font-size: 13.5px; color: var(--color-fg-2); display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .steps li { display: flex; gap: 12px; align-items: flex-start; } .steps i { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--color-line-2); display: grid; place-items: center; font-style: normal; font-size: 11px; color: var(--color-fg); }
  .steps b { color: var(--color-fg); font-weight: 500; }
  .link { color: var(--color-fg); text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--color-mute); }
  .tag { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; color: var(--color-mute); border: 1px solid var(--color-line); border-radius: 4px; padding: 0 5px; margin-left: 4px; white-space: nowrap; }
  .foot { padding: 8px 24px 28px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .dots { display: flex; gap: 6px; } .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--color-line-2); transition: all .25s; } .dots i.on { width: 18px; background: var(--color-fg); }
  .cta { width: 100%; padding: 14px; border-radius: 12px; background: var(--color-fg); color: var(--color-bg); font-weight: 600; font-size: 15px; }
  @media (prefers-reduced-motion: reduce) {
    .slides, .dots i { transition: none; }
    .word { animation: none; opacity: 1; }
  }
</style>
