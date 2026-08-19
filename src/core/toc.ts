/**
 * toc.ts — Interactive Table of Contents reading rail (level-bar design).
 *
 * Call setupToc(root) after each render (from previewRuntime.runShared).
 * Uses document-level event delegation (wired once, immune to morphdom) and
 * module-level state so VS Code's per-keystroke morphdom re-renders don't reset
 * the active bar or scroll listener.
 *
 * Works identically in the VS Code preview (scrolling .output-pane / document)
 * and exported HTML (document scroll): one capture-phase window scroll listener
 * sees scroll events from any descendant container, and the active-heading
 * threshold is computed from the scroll container's actual viewport top instead
 * of a hardcoded offset.
 */

// ─── State (survives morphdom re-renders) ─────────────────────────────────────

/** Whether document-level delegated listeners have been attached. */
let wired = false

/**
 * Heading elements in index order (by data-em-toc-id value).
 * Includes directive-internal headings (e.g. an :::explorer detail pane's
 * `### … {#id}`) — the em_directive renderer stamps data-em-toc-id onto them
 * too, so this stays 1:1 with tocItems regardless of where a heading lives.
 */
let headings: HTMLElement[] = []

/** ToC <li> elements in the same order as headings. */
let tocItems: HTMLElement[] = []

/** The <ol.em-toc__list> element — used for scroll-active-into-view. */
let tocList: HTMLElement | null = null

/** rAF handle to throttle scroll/resize updates. */
let rafHandle = 0

// ─── Public ───────────────────────────────────────────────────────────────────

export function setupToc(root: HTMLElement): void {
  // Rebuild from current DOM — morphdom may have replaced nodes.
  const raw = root.querySelectorAll<HTMLElement>('[data-em-toc-id]')
  headings = Array.from(raw).sort((a, b) => {
    const ai = parseInt(a.dataset['emTocId'] ?? '0', 10)
    const bi = parseInt(b.dataset['emTocId'] ?? '0', 10)
    return ai - bi
  })
  tocItems = Array.from(root.querySelectorAll<HTMLElement>('.em-toc__item'))
  tocList  = root.querySelector<HTMLElement>('.em-toc__list')

  wireOnce()
  updateActive()
}

// ─── Wire-once: event delegation ─────────────────────────────────────────────

function wireOnce(): void {
  if (wired) return
  wired = true

  document.addEventListener('click', onTocClick)

  // Scroll-spy: capture phase on window sees scroll events from ANY descendant
  // scroll container — the preview's .output-pane or the document itself in
  // exported HTML — with a single listener.
  window.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true })
  window.addEventListener('resize', scheduleUpdate, { passive: true })

  // When the .em-toc panel is entered, scroll so the active item is visible.
  document.addEventListener('mouseenter', onRailEnter, true)
}

// ─── Click handler ────────────────────────────────────────────────────────────

function onTocClick(e: Event): void {
  const target = e.target as Element | null
  if (!target) return
  const link = target.closest<HTMLAnchorElement>('.em-toc a[data-toc-target]')
  if (!link) return
  e.preventDefault()
  const idx = link.getAttribute('data-toc-target')
  if (idx === null) return
  const heading = headings[parseInt(idx, 10)]
  if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ─── Hover: scroll active into view in the expanded panel ────────────────────

function onRailEnter(e: Event): void {
  const target = e.target as Element | null
  // Only act when entering the .em-toc nav itself (not every child mouseenter).
  // target can be a non-Element (e.g. Document) — removing the element under
  // the cursor (mermaid's expand-modal close does this) fires a mouseenter
  // whose target has no classList, so this needs its own `?.`, not just the
  // one on `target`.
  if (!target?.classList?.contains('em-toc')) return
  requestAnimationFrame(scrollActiveIntoView)
}

function scrollActiveIntoView(): void {
  const list = tocList
  if (!list || list.scrollHeight <= list.clientHeight) return
  const active = list.querySelector<HTMLElement>('.em-toc__item.is-active')
  if (!active) return
  const target = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2
  list.scrollTop = Math.max(0, target)
}

// ─── Scroll-spy ───────────────────────────────────────────────────────────────

function scheduleUpdate(): void {
  if (rafHandle) return
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0
    updateActive()
  })
}

function updateActive(): void {
  if (headings.length === 0) return

  // Threshold = top of the actual scroll viewport (+8px grace), not a
  // hardcoded offset — exported HTML has no .output-pane and starts at 0.
  const pane = document.querySelector('.output-pane')
  const threshold = (pane ? pane.getBoundingClientRect().top : 0) + 8

  // Active = last heading at/above the threshold.
  // ponytail: O(headings) rect scan per scroll frame; fine to ~1k headings.
  let activeIdx = 0
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].getBoundingClientRect().top <= threshold) {
      activeIdx = i
    } else {
      break
    }
  }

  tocItems.forEach((item, i) => {
    item.classList.toggle('is-active', i === activeIdx)
    item.classList.toggle('is-passed', i < activeIdx)
  })
}
