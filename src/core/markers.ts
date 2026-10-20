/**
 * markers.ts — browser behaviour for numbered markers (see directives/annotate.ts).
 *
 * Two jobs:
 *   1. Link: hovering or clicking anything with data-mk="n" lights every data-mk="n"
 *      in the same scope (the nearest .annot, else the document). Delegated once on
 *      document, so it survives VS Code's morphdom patching.
 *   2. Align: inside a .annot on a wide container, each note is moved level with its
 *      marker in the material, pushed down just enough to never overlap the note above.
 *      Narrow containers keep the plain stacked layout.
 *
 * Alignment writes inline styles, which morphdom wipes on every edit, so
 * setupMarkers() runs after every render; a ResizeObserver per .annot re-aligns when
 * its width changes or a hidden tab panel / late image gives it a real size.
 */

/** Container width below which notes stack under the material instead of beside it. */
const WIDE_MIN = 760
const NOTE_GAP = 8

let wired = false
/** Marker pinned by a click, per scope element (null scope = document). */
let pinned: { scope: Element | Document; n: string } | null = null
const observed = new WeakSet<Element>()
const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => entries.forEach(e => alignAnnot(e.target as HTMLElement)))
  : null

export function setupMarkers(root: HTMLElement): void {
  wireOnce()
  root.querySelectorAll<HTMLElement>('.annot').forEach(el => {
    if (ro && !observed.has(el)) {
      observed.add(el)
      ro.observe(el)
    }
    alignAnnot(el)
  })
  if (pinned) light(pinned.scope, pinned.n, true)
}

function wireOnce(): void {
  if (wired) return
  wired = true
  document.addEventListener('mouseover', e => onHover(e, true))
  document.addEventListener('mouseout', e => onHover(e, false))
  document.addEventListener('click', onClick)
  // Late-loading images move the markers they carry.
  document.addEventListener('load', e => {
    const t = e.target as Element | null
    const annot = t instanceof HTMLImageElement ? t.closest<HTMLElement>('.annot') : null
    if (annot) alignAnnot(annot)
  }, true)
}

// ─── Link ─────────────────────────────────────────────────────────────────────

function scopeOf(el: Element): Element | Document {
  return el.closest('.annot') ?? document
}

function markerOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-mk]') : null
}

function light(scope: Element | Document, n: string, on: boolean): void {
  scope.querySelectorAll<HTMLElement>(`[data-mk="${n}"]`).forEach(el => {
    if (on) el.setAttribute('data-mk-on', '')
    else el.removeAttribute('data-mk-on')
  })
}

function onHover(e: Event, on: boolean): void {
  const mk = markerOf(e.target)
  if (!mk?.dataset.mk) return
  const scope = scopeOf(mk)
  // Leaving a marker must not extinguish the one a click pinned.
  if (!on && pinned && pinned.scope === scope && pinned.n === mk.dataset.mk) return
  light(scope, mk.dataset.mk, on)
}

function onClick(e: Event): void {
  const mk = markerOf(e.target)
  // Click on nothing marker-ish: drop the pin.
  if (!mk?.dataset.mk) {
    if (pinned) {
      light(pinned.scope, pinned.n, false)
      pinned = null
    }
    return
  }
  const scope = scopeOf(mk)
  const n = mk.dataset.mk
  const same = pinned && pinned.scope === scope && pinned.n === n
  if (pinned) light(pinned.scope, pinned.n, false)
  pinned = same ? null : { scope, n }
  if (pinned) light(scope, n, true)
}

// ─── Align ────────────────────────────────────────────────────────────────────

function alignAnnot(annot: HTMLElement): void {
  const main  = annot.querySelector<HTMLElement>(':scope > .annot__main')
  const notes = annot.querySelector<HTMLElement>(':scope > .annot__notes')
  if (!main || !notes) return

  const wide = annot.clientWidth >= WIDE_MIN
  const items = Array.from(notes.querySelectorAll<HTMLElement>(':scope > .marker'))

  if (!wide) {
    annot.removeAttribute('data-aligned')
    items.forEach(n => { n.style.top = '' })
    notes.style.minHeight = ''
    return
  }

  annot.setAttribute('data-aligned', '')
  // Measured against the notes column, so scroll position and layout offsets cancel out.
  const colTop = notes.getBoundingClientRect().top
  let cursor = 0
  items.forEach(note => {
    const n = note.dataset.mk
    const anchor = n ? main.querySelector<HTMLElement>(`[data-mk="${n}"]`) : null
    const want = anchor ? anchor.getBoundingClientRect().top - colTop : cursor
    const top = Math.max(want, cursor)
    note.style.top = `${top}px`
    cursor = top + note.offsetHeight + NOTE_GAP
  })
  // Absolutely-positioned notes no longer size their column; keep the block tall enough.
  notes.style.minHeight = `${Math.max(0, cursor - NOTE_GAP)}px`
}
