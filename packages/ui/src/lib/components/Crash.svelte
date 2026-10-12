<script lang="ts">
  /**
   * What you see when the page itself breaks: a plain sentence, a way back, and a way to tell us.
   * Nothing here depends on the control room, so it works when the problem is a lost connection too.
   */
  import { href } from "../router.svelte";
  let { message, onRetry }: { message: string; onRetry: () => void } = $props();
</script>

<section class="rise mx-auto max-w-md px-4 py-16 text-center" role="alert">
  <div class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border hairline text-[22px]" aria-hidden="true">!</div>
  <h1 class="text-[20px] font-semibold tracking-tight">Garu hit a problem</h1>
  <p class="mt-2 text-[14px] text-fg-2">Something on this screen went wrong. Your agents keep running on your computer; nothing was lost.</p>
  <p class="mono mt-3 text-[12px] text-mute [overflow-wrap:anywhere]">{message}</p>
  <div class="mt-5 flex flex-wrap justify-center gap-2">
    <button class="btn btn-primary" onclick={onRetry}>Try again</button>
    <a class="btn" href={href("report")} onclick={onRetry}>Report a problem</a>
  </div>
</section>
