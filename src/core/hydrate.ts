/**
 * hydrate.ts — Dependency-free post-render interactivity.
 *
 * Call hydrate(root) after injecting rendered HTML into the DOM.
 * Wires:
 *   - Tab switching ([data-tabs] containers)
 *   - Accordion coordinated collapse ([data-accordion] containers)
 *   - File-ref copy buttons
 *
 * Uses document-level event delegation (wired once, immune to morphdom) and
 * module-level state stores so that VS Code's morphdom patching does not
 * reset the active tab or open disclosure on every keystroke.
 */

// ─── State stores (survive morphdom re-renders) ───────────────────────────────

/** Maps [data-tabs] container index → active tab-index value. */
const tabState = new Map<number, number>()

/** Maps details.details element index → open state. */
const detailsState = new Map<number, boolean>()

/** Whether document-level delegated listeners have been attached. */
let wired = false

// ─── Public ───────────────────────────────────────────────────────────────────

/** Wire all interactive components within a root element. */
export function hydrate(root: HTMLElement): void {
  wireOnce()
  restoreState(root)
}

// ─── Wire-once: event delegation ──────────────────────────────────────────────

function wireOnce(): void {
  if (wired) return
  wired = true
  document.addEventListener('click', onDocClick)
  // `toggle` doesn't bubble — use capture phase to intercept at document level.
  document.addEventListener('toggle', onDocToggle, true)
}

// ─── Click handler ─────────────────────────────────────────────────────────────

function onDocClick(e: Event): void {
  const target = e.target as Element | null
  if (!target) return

  // Tab button
  const btn = target.closest<HTMLButtonElement>('.tab-btn')
  if (btn) {
    const container = btn.closest<HTMLElement>('[data-tabs]')
    if (!container) return

    const activeIdx = parseInt(btn.dataset.tabIndex ?? '0', 10)

    container.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => b.removeAttribute('data-active'))
    container.querySelectorAll<HTMLElement>('.tab-panel').forEach(p => p.removeAttribute('data-active'))
    btn.setAttribute('data-active', '')
    container.querySelector<HTMLElement>(`.tab-panel[data-tab-index="${activeIdx}"]`)?.setAttribute('data-active', '')

    // Snapshot by container index so state survives morphdom node replacement.
    const containerIdx = indexOf(container, '[data-tabs]')
    if (containerIdx !== -1) tabState.set(containerIdx, activeIdx)
    return
  }

  // File-ref copy
  const fileRef = target.closest<HTMLElement>('code.file-ref[data-copy]')
  if (fileRef) {
    const text = fileRef.dataset.copy ?? fileRef.textContent ?? ''
    navigator.clipboard.writeText(text).then(() => {
      fileRef.setAttribute('data-copied', '')
      setTimeout(() => fileRef.removeAttribute('data-copied'), 1200)
    }).catch(() => {
      // clipboard blocked — no-op
    })
  }
}

// ─── Toggle handler (capture) ─────────────────────────────────────────────────

function onDocToggle(e: Event): void {
  const el = e.target as HTMLDetailsElement | null
  if (!el || !el.matches('details.details')) return

  // Snapshot by element index so state survives morphdom node replacement.
  const idx = indexOf(el, 'details.details')
  if (idx !== -1) detailsState.set(idx, el.open)

  // Accordion: if this one opened, close its siblings.
  if (el.open) {
    const accordion = el.closest<HTMLElement>('[data-accordion]')
    if (accordion) {
      accordion.querySelectorAll<HTMLDetailsElement>(':scope > details').forEach(sibling => {
        if (sibling !== el && sibling.open) sibling.open = false
      })
    }
  }
}

// ─── State restore ─────────────────────────────────────────────────────────────

function restoreState(_root: HTMLElement): void {
  // Tabs
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((container, i) => {
    if (!tabState.has(i)) return
    const activeIdx = tabState.get(i)!
    container.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => b.removeAttribute('data-active'))
    container.querySelectorAll<HTMLElement>('.tab-panel').forEach(p => p.removeAttribute('data-active'))
    container.querySelector<HTMLButtonElement>(`.tab-btn[data-tab-index="${activeIdx}"]`)?.setAttribute('data-active', '')
    container.querySelector<HTMLElement>(`.tab-panel[data-tab-index="${activeIdx}"]`)?.setAttribute('data-active', '')
  })

  // Details / accordion
  document.querySelectorAll<HTMLDetailsElement>('details.details').forEach((el, i) => {
    if (!detailsState.has(i)) return
    el.open = detailsState.get(i)!
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the index of el among all document elements matching selector. */
function indexOf(el: Element, selector: string): number {
  return Array.from(document.querySelectorAll(selector)).indexOf(el)
}
