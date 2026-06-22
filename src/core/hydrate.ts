/**
 * hydrate.ts — Dependency-free post-render interactivity.
 *
 * Call hydrate(root) after injecting rendered HTML into the DOM.
 * Wires:
 *   - Tab switching ([data-tabs] containers)
 *   - Accordion coordinated collapse ([data-accordion] containers)
 *
 * Mermaid is intentionally NOT here (heavy dep) — handled in viewer/mermaid.ts.
 */

/** Wire all interactive components within a root element. */
export function hydrate(root: HTMLElement): void {
  hydrateTabs(root)
  hydrateAccordions(root)
  hydrateFileRefs(root)
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

function hydrateTabs(root: HTMLElement): void {
  const tabContainers = root.querySelectorAll<HTMLElement>('[data-tabs]')

  tabContainers.forEach(container => {
    const buttons = container.querySelectorAll<HTMLButtonElement>('.tab-btn')
    const panels  = container.querySelectorAll<HTMLElement>('.tab-panel')

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.tabIndex

        // Deactivate all
        buttons.forEach(b => b.removeAttribute('data-active'))
        panels.forEach(p => p.removeAttribute('data-active'))

        // Activate clicked
        btn.setAttribute('data-active', '')
        const targetPanel = container.querySelector<HTMLElement>(
          `.tab-panel[data-tab-index="${idx}"]`,
        )
        targetPanel?.setAttribute('data-active', '')
      })
    })
  })
}

// ─── File refs ────────────────────────────────────────────────────────────

function hydrateFileRefs(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('code.file-ref[data-copy]').forEach(el => {
    el.addEventListener('click', async () => {
      const text = el.dataset.copy ?? el.textContent ?? ''
      try {
        await navigator.clipboard.writeText(text)
        el.setAttribute('data-copied', '')
        setTimeout(() => el.removeAttribute('data-copied'), 1200)
      } catch {
        // clipboard blocked or unavailable — no-op
      }
    })
  })
}

// ─── Accordion ────────────────────────────────────────────────────────────

function hydrateAccordions(root: HTMLElement): void {
  const accordions = root.querySelectorAll<HTMLElement>('[data-accordion]')

  accordions.forEach(accordion => {
    const details = accordion.querySelectorAll<HTMLDetailsElement>(':scope > details')

    details.forEach(detail => {
      detail.addEventListener('toggle', () => {
        if (detail.open) {
          // Close all siblings
          details.forEach(sibling => {
            if (sibling !== detail && sibling.open) {
              sibling.open = false
            }
          })
        }
      })
    })
  })
}
