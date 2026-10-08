<script lang="ts">
  /**
   * First launch of the app: a short splash, then five screens that answer the
   * questions a stranger has, in order, ending on the pairing screen itself.
   */
  import Logo from "../lib/components/Logo.svelte";
  import Creature from "../lib/components/Creature.svelte";
  import Pair from "./Pair.svelte";
  import { haptic } from "../lib/native";

  let { onDone, splash = true, alreadyPaired = false }: { onDone: () => void; splash?: boolean; alreadyPaired?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let phase = $state<"splash" | "slides">(splash ? "splash" : "slides");
  let i = $state(0);
  const LAST = 4;
  $effect(() => { if (phase === "splash") { const t = setTimeout(() => (phase = "slides"), 1700); return () => clearTimeout(t); } });

  function next() { if (i < LAST) { i++; void haptic("light"); } }
  function skip() { i = LAST; }

  // swipe
  let x0 = 0;
  const onStart = (e: TouchEvent) => { x0 = e.touches[0]!.clientX; };
  const onEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - x0;
    if (dx < -50 && i < LAST) i++; else if (dx > 50 && i > 0) i--;
  };

  const kinds = [
    { kind: "owl", name: "Owl", does: "watches things", color: "#4f8fd9" },
    { kind: "fox", name: "Fox", does: "brings you news", color: "#d0663a" },
    { kind: "turtle", name: "Turtle", does: "keeps a log", color: "#2a9d78" },
    { kind: "bee", name: "Bee", does: "works in a box", color: "#c9a227" },
    { kind: "cat", name: "Cat", does: "reads for you", color: "#9a6fd0" },
    { kind: "octopus", name: "Octopus", does: "juggles tasks", color: "#d05a8a" },
  ] as const;
</script>

{#if phase === "splash"}
  <div class="splash" role="img" aria-label="Garu">
    <Logo size={132} animate />
    <div class="word">Garu</div>
  </div>
{:else}
  <div class="intro" role="region" aria-roledescription="carousel" aria-label="Introduction" ontouchstart={onStart} ontouchend={onEnd}>
    <div class="bar">
      <span></span>
      {#if i < LAST}<button class="text-[13px] text-fg-2" onclick={skip}>Skip</button>{/if}
    </div>

    <div class="slides" style="transform: translateX({-i * 100}%)">
      <section class="slide">
        <Logo size={116} />
        <h1>Agents that work while you sleep. Under rules you wrote.</h1>
        <p>Garu runs your agents around the clock on your own computer. This app is the control room: see what they did, approve what they ask, talk to them.</p>
      </section>

      <section class="slide">
        <h1>An agent is one file.</h1>
        <p>Who it is, which model it thinks with, when it runs, what tools it can reach, and what it's allowed to do. You can read it before you run it.</p>
        <div class="card yaml mono">
          <span class="k">name:</span> <b>tomay</b><br>
          <span class="k">persona:</span> fox · <i>“Gathers the morning.”</i><br>
          <span class="k">model:</span> gemini/flash-lite<br>
          <span class="k">when:</span> weekdays 07:00<br>
          <span class="k">tools:</span> web, files<br>
          <span class="k">policy:</span><br>
          &nbsp;&nbsp;fetch 4 sites <span class="hl">→ allow</span><br>
          &nbsp;&nbsp;post to Slack <span class="hl">→ ask</span><br>
          &nbsp;&nbsp;anything else <span class="hl">→ block</span>
        </div>
      </section>

      <section class="slide">
        <h1>Every action passes through your policy.</h1>
        <p>Allow runs. Ask pauses and comes to your phone. Block never reaches the agent at all. If you don't answer, the answer is no.</p>
        <div class="card rc">
          <div class="h"><span class="orb" style="background:#d0663a"><Creature kind="fox" size={22} /></span><span><b>tomay</b> wants to post <span class="mono">post_message</span></span></div>
          <div class="body"># Morning brief — Thursday<br>High 71°F / Low 48°F, clear.<br>3 stars, 1 fork, pushed 2 hours ago…</div>
          <div class="btns"><span class="ok">Approve</span><span>For 24h</span><span class="no">Decline</span></div>
        </div>
      </section>

      <section class="slide">
        <h1>Meet the kinds.</h1>
        <p>Every agent has a face that says what it's for. Pick one when you make your own.</p>
        <div class="grid">
          {#each kinds as k (k.kind)}
            <div class="c"><div class="orb big" style="background:{k.color}"><Creature kind={k.kind} size={46} /></div><b>{k.name}</b>{k.does}</div>
          {/each}
        </div>
      </section>

      <section class="slide last">
        {#if alreadyPaired}
          <h1>You're connected.</h1>
          <p>This phone is already paired with your computer, so there's nothing to set up. That's the whole tour.</p>
        {:else}
        <h1>Connect to your computer.</h1>
        <p>Your agents live on the computer running Garu. Pair this phone once and it stays connected over your private network. Nothing goes through a cloud.</p>
        {/if}
        {#if !alreadyPaired}
        <ol class="steps">
          <li><i>1</i><span>On your computer, open Garu → <b>Settings → Your phone</b>.</span></li>
          <li><i>2</i><span>Press <b>Show sign-in code</b> and scan it here, or paste the link.</span></li>
          <li><i>3</i><span>Don't have Garu yet? <code>npx garu new</code> makes your first agent in a minute; the website walks you through it.</span></li>
        </ol>
        <div class="w-full"><Pair embedded /></div>
        {/if}
      </section>
    </div>

    <div class="foot">
      <div class="dots">{#each Array(LAST + 1) as _, d}<i class:on={d === i}></i>{/each}</div>
      {#if i < LAST}
        <button class="cta" onclick={next}>{i === 0 ? "How does it work?" : "Next"}</button>
      {:else if alreadyPaired}
        <button class="cta" onclick={onDone}>Done</button>
      {:else}
        <button class="text-[12.5px] text-mute" onclick={onDone}>I'll pair later</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .splash { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: var(--color-fg); background: var(--color-bg); }
  .word { font-size: 22px; font-weight: 650; letter-spacing: -.02em; opacity: 0; animation: word .5s 1.1s forwards; }
  @keyframes word { to { opacity: 1; } }

  .intro { min-height: 100dvh; display: flex; flex-direction: column; background: var(--color-bg); overflow: hidden; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .bar { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px 0; min-height: 44px; }
  .slides { flex: 1; display: flex; transition: transform .35s cubic-bezier(.2,.8,.2,1); }
  .slide { flex: 0 0 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 12px 28px 16px; text-align: center; overflow-y: auto; }
  .slide.last { justify-content: flex-start; padding-top: 24px; }
  h1 { font-size: 28px; line-height: 1.12; letter-spacing: -.03em; font-weight: 650; margin: 0; }
  p { margin: 0; color: var(--color-fg-2); font-size: 15px; line-height: 1.55; }
  .card { width: 100%; background: var(--color-panel); border: 1px solid var(--color-line); border-radius: 14px; text-align: left; overflow: hidden; }
  .yaml { padding: 14px 16px; font-size: 12.5px; line-height: 1.7; color: var(--color-fg-2); } .yaml b { color: var(--color-fg); font-weight: 500; } .yaml .k { color: var(--color-mute); } .yaml .hl { color: var(--color-ask); }
  .rc { border-color: color-mix(in oklab, var(--color-ask) 40%, var(--color-line)); }
  .rc .h { display: flex; gap: 10px; align-items: center; padding: 12px 14px; font-size: 13.5px; } .rc .h b { font-weight: 600; }
  .rc .body { margin: 0 14px; border: 1px solid var(--color-line); border-radius: 10px; background: color-mix(in oklab, var(--color-bg) 60%, transparent); font-size: 12px; color: var(--color-fg-2); padding: 10px 12px; line-height: 1.5; }
  .rc .btns { display: flex; gap: 8px; padding: 12px 14px; } .rc .btns span { flex: 1; text-align: center; padding: 9px; border-radius: 9px; border: 1px solid var(--color-line-2); font-size: 13px; }
  .rc .btns .ok { border-color: color-mix(in oklab, var(--color-ok) 40%, transparent); color: var(--color-ok); } .rc .btns .no { border-color: color-mix(in oklab, var(--color-bad) 40%, transparent); color: var(--color-bad); }
  .orb { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  .orb.big { width: 64px; height: 64px; margin: 0 auto 8px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 10px; width: 100%; }
  .c { text-align: center; font-size: 12.5px; color: var(--color-fg-2); } .c b { display: block; color: var(--color-fg); font-weight: 600; font-size: 13px; }
  .steps { width: 100%; text-align: left; font-size: 13.5px; color: var(--color-fg-2); display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .steps li { display: flex; gap: 12px; align-items: flex-start; } .steps i { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--color-line-2); display: grid; place-items: center; font-style: normal; font-size: 11px; color: var(--color-fg); }
  .steps b { color: var(--color-fg); font-weight: 500; }
  code { font-family: var(--font-mono, ui-monospace, monospace); background: var(--color-panel-2); border: 1px solid var(--color-line); border-radius: 6px; padding: 1px 6px; font-size: 12px; color: var(--color-fg); }
  .foot { padding: 8px 24px 28px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .dots { display: flex; gap: 6px; } .dots i { width: 6px; height: 6px; border-radius: 3px; background: var(--color-line-2); transition: all .25s; } .dots i.on { width: 18px; background: var(--color-fg); }
  .cta { width: 100%; padding: 14px; border-radius: 12px; background: var(--color-fg); color: var(--color-bg); font-weight: 600; font-size: 15px; }
</style>
