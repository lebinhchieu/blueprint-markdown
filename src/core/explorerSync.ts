/**
 * explorerSync.ts — client-side node↔section linking for :::explorer.
 *
 * Pairs each mermaid node whose id ends `flowchart-N<k>-<n>` with the detail
 * heading whose text starts `<k>.`, marks the linked nodes, and scrolls to a
 * section when its node is clicked. Called from previewRuntime.runShared AFTER
 * renderMermaid resolves — there is no SVG to match against before that.
 *
 * Clicking is a *transient* action: scroll to the section, flash both ends of
 * the pair, then everything returns to normal. There is no persistent selected
 * state and deliberately no scroll-spy — the pinned diagram already tells you
 * where you are, and a lingering highlight only competes with it.
 *
 * Two hard constraints, both measured against mermaid 11.15:
 *  1. Node ids carry a per-render prefix (`mermaid-<ts>-flowchart-N1-0`), so
 *     an `[id^="flowchart-…"]` selector silently matches nothing.
 *  2. `classDef` writes `!important` inline on the node <rect>, so no CSS can
 *     restyle its fill or border. The <g> has no inline style — style that,
 *     and append the "has detail" badge as a new child.
 */

import { getMermaidPanHandle } from './mermaidPanZoom'

const RE_NODE_ID = /flowchart-N(\d+)-\d+$/
const RE_HEADING_NUM = /^\s*(\d+)\s*\./
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Above this fraction of the viewport, a stacked diagram is too tall to pin —
 * sticking it would leave almost no room to read the section it points at.
 */
const STACKED_STICKY_MAX = 0.6

/** Must outlast the flash animations in components.css. */
const FLASH_MS = 1400

interface Pair {
  n: number
  g: SVGGElement
  heading: HTMLElement
}

interface Instance {
  el: HTMLElement
  pin: HTMLElement
  detail: HTMLElement
  pairs: Pair[]
}

/** Rebuilt on every render pass — morphdom may have replaced every node. */
let instances: Instance[] = []
let wired = false
let rafHandle = 0

/** Watches each pin's own box, so dragging the diagram's native resize handle
 *  re-evaluates the sticky budget — a window `resize` never fires for that. */
let pinObserver: ResizeObserver | null = null

/** Pending flash timers, so a repeat click doesn't get cut short by the
 *  previous click's cleanup. */
const flashTimers = new WeakMap<Element, number>()

// ─── Public ───────────────────────────────────────────────────────────────────

export function setupExplorers(root: HTMLElement): void {
  instances = []
  // morphdom replaces the pins, so the previous pass's observations are stale.
  pinObserver?.disconnect()

  root.querySelectorAll<HTMLElement>('.em-explorer').forEach(el => {
    const pin = el.querySelector<HTMLElement>('.em-explorer__pin')
    const detail = el.querySelector<HTMLElement>('.em-explorer__detail')
    if (!pin || !detail) return

    // Detail headings are direct children: privateMd.render() emits them at
    // the top level of the pane. A heading wrapped in a nested directive is
    // deliberately not a link target.
    const byNum = new Map<number, HTMLElement>()
    detail
      .querySelectorAll<HTMLElement>(
        ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
      )
      .forEach(h => {
        const m = (h.textContent ?? '').match(RE_HEADING_NUM)
        if (!m) return
        const n = parseInt(m[1], 10)
        if (!byNum.has(n)) byNum.set(n, h) // first wins on duplicates
      })

    const pairs: Pair[] = []
    pin.querySelectorAll<SVGGElement>('g.node').forEach(g => {
      const m = g.id.match(RE_NODE_ID)
      if (!m) return
      const n = parseInt(m[1], 10)
      const heading = byNum.get(n)
      if (!heading) return // fail-soft: node with no section stays unmarked
      markLinked(g)
      heading.classList.add('em-explorer__section--linked')
      pairs.push({ n, g, heading })
    })

    if (pairs.length === 0) return // non-flowchart diagram, or no matches

    instances.push({ el, pin, detail, pairs })
  })

  wireOnce()

  if (typeof ResizeObserver !== 'undefined') {
    pinObserver ??= new ResizeObserver(scheduleLayout)
    for (const inst of instances) pinObserver.observe(inst.pin)
  }

  layout()
}

// ─── Linked affordance ────────────────────────────────────────────────────────

/**
 * Mark a node as having detail behind it. An *unmarked* node must reliably
 * mean "nothing more to read" — that guarantee is the whole point of the
 * directive, so this runs for every matched node, not just hovered ones.
 *
 * The badge is an appended <circle> rather than a border change because
 * classDef's inline !important makes the rect's stroke unstylable.
 */
function markLinked(g: SVGGElement): void {
  g.classList.add('em-explorer__node--linked')
  if (g.querySelector('.em-explorer__badge')) return // idempotent across renders

  let box: DOMRect
  try {
    box = g.getBBox()
  } catch {
    return // not rendered/measurable yet — skip the badge, keep the cursor
  }

  const badge = document.createElementNS(SVG_NS, 'circle')
  badge.setAttribute('class', 'em-explorer__badge')
  badge.setAttribute('cx', String(box.x + box.width))
  badge.setAttribute('cy', String(box.y))
  badge.setAttribute('r', '4')
  g.appendChild(badge)
}

// ─── Wire-once: event delegation ─────────────────────────────────────────────

function wireOnce(): void {
  if (wired) return
  wired = true
  document.addEventListener('click', onClick)
  // Resize only — no scroll listener. Layout depends on the pin's measured
  // height, which changes with the viewport and nothing else.
  window.addEventListener('resize', scheduleLayout, { passive: true })
}

// ─── Click → jump to the other end of the pair and flash both ────────────────

const HEADING_SEL =
  '.em-explorer__detail > h1, .em-explorer__detail > h2, .em-explorer__detail > h3,' +
  '.em-explorer__detail > h4, .em-explorer__detail > h5, .em-explorer__detail > h6'

function onClick(e: MouseEvent): void {
  if (e.button !== 0) return // pan is right-drag; only claim the left button
  // A left-drag that selected text also fires click — don't hijack that.
  const sel = document.getSelection()
  if (sel && !sel.isCollapsed) return

  const target = e.target as Element | null
  // Links and click-to-copy file refs own their clicks. Section headings are
  // written as "### 1. Name — `path:line`", so every one of them contains a
  // code.file-ref — without this the copy gesture would pan the diagram instead.
  if (!target || target.closest('a, code.file-ref[data-copy]')) return

  const g = target.closest?.('g.node')
  if (g) {
    onNodeClick(g)
    return
  }

  const heading = target.closest<HTMLElement>(HEADING_SEL)
  if (heading) onSectionClick(heading)
}

/** Section heading clicked → bring its node into view in the pinned diagram. */
function onSectionClick(heading: HTMLElement): void {
  for (const inst of instances) {
    const pair = inst.pairs.find(p => p.heading === heading)
    if (!pair) continue
    revealNode(inst, pair.g)
    flash(pair.g, 'em-explorer__node--flash')
    flash(pair.heading, 'em-explorer__section--flash')
    return
  }
}

/**
 * Pan the pinned diagram so a node is visible, but only when it isn't already —
 * at the default fit transform everything is on screen and nothing should move.
 * Only reachable once the reader has panned or zoomed.
 */
function revealNode(inst: Instance, g: SVGGElement): void {
  const panel = inst.pin.querySelector<HTMLElement>('.mermaid')
  const viewport = inst.pin.querySelector<HTMLElement>('.em-mermaid__viewport')
  if (!panel || !viewport) return

  const vb = viewport.getBoundingClientRect()
  const nb = g.getBoundingClientRect()
  const margin = 12
  const inside =
    nb.left >= vb.left + margin &&
    nb.right <= vb.right - margin &&
    nb.top >= vb.top + margin &&
    nb.bottom <= vb.bottom - margin
  if (inside) return

  getMermaidPanHandle(panel)?.panBy(
    vb.left + vb.width / 2 - (nb.left + nb.width / 2),
    vb.top + vb.height / 2 - (nb.top + nb.height / 2),
  )
}

/** Diagram node clicked → scroll its section into view. */
function onNodeClick(g: Element): void {
  for (const inst of instances) {
    const pair = inst.pairs.find(p => p.g === g)
    if (!pair) continue
    // Reveal the whole section, not just its heading. scroll-margin-bottom
    // extends the heading's scroll box down over its own content, so
    // 'nearest' — which still scrolls the minimum, and does nothing when the
    // section already fits — treats the section as the thing to bring into
    // view. When the section is taller than the viewport, 'nearest' falls back
    // to aligning the top edge, which is what we'd want anyway.
    pair.heading.style.scrollMarginBottom = `${sectionContentHeight(inst, pair.heading)}px`
    pair.heading.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    flash(pair.g, 'em-explorer__node--flash')
    flash(pair.heading, 'em-explorer__section--flash')
    return
  }
}

/**
 * Height of everything below `heading` up to the next top-level heading in the
 * detail pane (or the end of the pane) — i.e. the section's body.
 */
function sectionContentHeight(inst: Instance, heading: HTMLElement): number {
  let end = inst.detail.getBoundingClientRect().bottom
  for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
    if (/^H[1-6]$/.test(el.tagName)) {
      end = el.getBoundingClientRect().top
      break
    }
  }
  return Math.max(0, Math.round(end - heading.getBoundingClientRect().bottom))
}

/**
 * Run a one-shot highlight and clean up after itself, leaving no state behind.
 * Re-adding the class after a forced reflow restarts the CSS animation, so
 * clicking the same node twice flashes twice instead of doing nothing.
 */
function flash(el: Element, cls: string): void {
  const pending = flashTimers.get(el)
  if (pending !== undefined) window.clearTimeout(pending)

  el.classList.remove(cls)
  el.getBoundingClientRect() // force reflow — works on SVG and HTML alike
  el.classList.add(cls)

  flashTimers.set(
    el,
    window.setTimeout(() => {
      el.classList.remove(cls)
      flashTimers.delete(el)
    }, FLASH_MS),
  )
}

// ─── Layout: stacked-mode sticky budget and scroll offset ────────────────────

function scheduleLayout(): void {
  if (rafHandle) return
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0
    layout()
  })
}

/**
 * Two things CSS can't decide on its own, because both depend on the rendered
 * height of the diagram:
 *
 *  - Whether to pin at all. A stacked diagram taller than STACKED_STICKY_MAX
 *    of the viewport would cover the text it points at, so it scrolls away
 *    normally instead.
 *  - How far to scroll past a heading. scrollIntoView doesn't know a sticky
 *    element overlaps the target, so the pin's height becomes the heading's
 *    scroll-margin-top.
 */
function layout(): void {
  for (const inst of instances) {
    const pinBox = inst.pin.getBoundingClientRect()
    const detailBox = inst.detail.getBoundingClientRect()

    // Stacked = panes share a column rather than sitting side by side.
    // Measured rather than matchMedia so it also covers {pin=top} on a wide
    // screen — but compared HORIZONTALLY: once the pin is sticky its vertical
    // rect tracks the scroll position, so a `pin.bottom <= detail.top` test
    // silently reports "side by side" the moment the page scrolls.
    const stacked = Math.abs(pinBox.left - detailBox.left) < 1
    const tooTall = stacked && pinBox.height > window.innerHeight * STACKED_STICKY_MAX

    inst.el.classList.toggle('em-explorer--no-sticky', tooTall)

    // Only a *pinned* pane overlaps the detail; otherwise no offset is needed.
    const offset = stacked && !tooTall ? Math.round(pinBox.height) : 0
    inst.el.style.setProperty('--em-explorer-pin-h', `${offset}px`)
  }
}
