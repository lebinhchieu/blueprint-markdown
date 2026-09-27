/**
 * motion.ts — smooth scrolling that survives an OS "reduce motion" preference.
 *
 * With Windows animation effects off, Chromium reports prefers-reduced-motion
 * and turns every native `behavior: 'smooth'` scroll into a jump. When
 * blueprintMarkdown.forceMotion is on (<html data-em-force-motion="true">),
 * these helpers animate scrollTop by hand instead — Chromium can't veto that.
 */

const DURATION = 400
const frames = new WeakMap<Element, number>()

function handRolled(): boolean {
  return document.documentElement.getAttribute('data-em-force-motion') === 'true'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function smoothScrollBy(el: Element, dy: number): void {
  if (!handRolled()) { el.scrollBy({ top: dy, behavior: 'smooth' }); return }
  cancelAnimationFrame(frames.get(el) ?? 0)
  const from = el.scrollTop
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION)
    el.scrollTop = from + dy * (1 - (1 - t) ** 3)
    if (t < 1) frames.set(el, requestAnimationFrame(step))
  }
  frames.set(el, requestAnimationFrame(step))
}

/** scrollIntoView on the document scroller, honouring scroll-margin like the native one. */
export function smoothScrollIntoView(el: Element, block: 'start' | 'center' | 'nearest'): void {
  if (!handRolled()) { el.scrollIntoView({ behavior: 'smooth', block }); return }
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const top = r.top - parseFloat(cs.scrollMarginTop)
  const bottom = r.bottom + parseFloat(cs.scrollMarginBottom)
  const vh = window.innerHeight
  let dy = 0
  if (block === 'start') dy = top
  else if (block === 'center') dy = (r.top + r.bottom) / 2 - vh / 2
  else if (top < 0 || bottom - top > vh) dy = top
  else if (bottom > vh) dy = bottom - vh
  if (dy) smoothScrollBy(document.scrollingElement ?? document.documentElement, dy)
}
