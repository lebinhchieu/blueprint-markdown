/**
 * explorerSync.ts — client-side node↔section linking for :::explorer.
 *
 * Pairs each mermaid node whose id ends `flowchart-N<k>-<n>` with the detail
 * heading whose text starts `<k>.`, marks the linked nodes, and scrolls to a
 * section when its node is clicked. Called from previewRuntime.runShared AFTER
 * renderMermaid resolves — there is no SVG to match against before that.
 *
 * Selection is click-driven only. There is deliberately no scroll-spy: a
 * pinned diagram already tells you where you are, and a spy fighting the
 * sticky pin made the highlight flicker as sections crossed the threshold.
 * The active pair stays put until the next click.
 *
 * Two hard constraints, both measured against mermaid 11.15:
 *  1. Node ids carry a per-render prefix (`mermaid-<ts>-flowchart-N1-0`), so
 *     an `[id^="flowchart-…"]` selector silently matches nothing.
 *  2. `classDef` writes `!important` inline on the node <rect>, so no CSS can
 *     restyle its fill or border. The <g> has no inline style — style that,
 *     and append the "has detail" badge as a new child.
 */

const RE_NODE_ID = /flowchart-N(\d+)-\d+$/
const RE_HEADING_NUM = /^\s*(\d+)\s*\./
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Above this fraction of the viewport, a stacked diagram is too tall to pin —
 * sticking it would leave almost no room to read the section it points at.
 */
const STACKED_STICKY_MAX = 0.6

interface Pair {
  n: number
  g: SVGGElement
  heading: HTMLElement
}

interface Instance {
  /** Position in document order — the key `activeByIndex` is stored under. */
  index: number
  el: HTMLElement
  pin: HTMLElement
  detail: HTMLElement
  pairs: Pair[]
}

/** Rebuilt on every render pass — morphdom may have replaced every node. */
let instances: Instance[] = []
let wired = false
let rafHandle = 0

/**
 * Active section per explorer, by document-order index. The selection is set
 * by clicking and has to outlive VS Code's morphdom re-render, which throws
 * away every element in `instances` on each keystroke.
 *
 * ponytail: keyed by index, so reordering explorers mid-edit can move a
 * highlight. It is a highlight; keying by content hash would cost more than
 * the bug.
 */
const activeByIndex = new Map<number, number>()

// ─── Public ───────────────────────────────────────────────────────────────────

export function setupExplorers(root: HTMLElement): void {
  instances = []

  root.querySelectorAll<HTMLElement>('.em-explorer').forEach((el, index) => {
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
      pairs.push({ n, g, heading })
    })

    if (pairs.length === 0) return // non-flowchart diagram, or no matches

    const inst: Instance = { index, el, pin, detail, pairs }
    instances.push(inst)

    // Re-apply the click selection this explorer had before the re-render.
    const previous = activeByIndex.get(index)
    if (previous !== undefined) paint(inst, previous)
  })

  wireOnce()
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
  document.addEventListener('click', onNodeClick)
  // Resize only — no scroll listener. Layout depends on the pin's measured
  // height, which changes with the viewport and nothing else.
  window.addEventListener('resize', scheduleLayout, { passive: true })
}

// ─── Click → scroll the section into view and keep it selected ───────────────

function onNodeClick(e: MouseEvent): void {
  if (e.button !== 0) return // pan is right-drag; only claim the left button
  // A left-drag that selected text also fires click — don't hijack that.
  const sel = document.getSelection()
  if (sel && !sel.isCollapsed) return

  const target = e.target as Element | null
  const g = target?.closest?.('g.node')
  if (!g) return

  for (const inst of instances) {
    const pair = inst.pairs.find(p => p.g === g)
    if (!pair) continue
    // 'nearest' scrolls the minimum needed; scroll-margin-top on the heading
    // (fed by layout() below) keeps it clear of a pinned diagram above it.
    pair.heading.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setActive(inst, pair.n)
    return
  }
}

function setActive(inst: Instance, n: number): void {
  activeByIndex.set(inst.index, n)
  paint(inst, n)
}

function paint(inst: Instance, n: number): void {
  for (const p of inst.pairs) {
    const on = p.n === n
    p.g.classList.toggle('em-explorer__node--active', on)
    p.heading.classList.toggle('em-explorer__section--active', on)
  }
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
