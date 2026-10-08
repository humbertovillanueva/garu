/**
 * Pull to refresh, as a Svelte action: `use:pullToRefresh={fn}` on the scrolling
 * element. Touch only, so it never gets in the way on a desktop. Drag down from
 * the top past the threshold and let go; the element gets `data-pull` (px) while
 * dragging and `data-pull="go"` while the refresh runs, so CSS can draw the hint.
 */
export function pullToRefresh(node: HTMLElement, fn: () => Promise<void> | void) {
  let startY = 0; let pulling = false; let armed = false;
  const THRESHOLD = 72;
  const scroller = () => (node.scrollTop > 0 ? node.scrollTop : document.scrollingElement?.scrollTop ?? 0);
  const onStart = (e: TouchEvent) => {
    if (scroller() > 0 || e.touches.length !== 1) return;
    startY = e.touches[0]!.clientY; pulling = true; armed = false;
  };
  const onMove = (e: TouchEvent) => {
    if (!pulling) return;
    const dy = e.touches[0]!.clientY - startY;
    if (dy <= 0 || scroller() > 0) { node.removeAttribute("data-pull"); return; }
    const px = Math.min(120, dy * 0.5);
    node.setAttribute("data-pull", String(Math.round(px)));
    armed = px >= THRESHOLD * 0.5;
  };
  const onEnd = async () => {
    if (!pulling) return;
    pulling = false;
    if (armed) {
      node.setAttribute("data-pull", "go");
      try { await fn(); } finally { node.removeAttribute("data-pull"); }
    } else node.removeAttribute("data-pull");
  };
  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: true });
  node.addEventListener("touchend", onEnd); node.addEventListener("touchcancel", onEnd);
  return { destroy() { node.removeEventListener("touchstart", onStart); node.removeEventListener("touchmove", onMove); node.removeEventListener("touchend", onEnd); node.removeEventListener("touchcancel", onEnd); } };
}
