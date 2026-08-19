/**
 * mermaidPanZoom.ts — Wraps a rendered mermaid <svg> with a draggable/zoomable
 * viewport plus zoom-in/out/reset/expand controls, and a fullscreen modal for
 * the expand action. No pan-zoom library is installed (see package.json) —
 * this hand-rolls the transform math, which is a handful of lines.
 *
 * The svg is pinned to its natural pixel size (from its own viewBox) and all
 * positioning — including the initial centered "fit to read" view — goes
 * through the same translate/scale transform. This keeps the math for
 * cursor-centered zoom exact: there's no separate flex-centering offset for
 * it to disagree with, and no percentage-width sizing for the browser to
 * resolve ambiguously against a shrink-to-fit parent (both were the cause of
 * an earlier version rendering diagrams tiny and blurry after zoom).
 *
 * Called by previewRuntime.renderMermaid() after every render pass (both
 * cache-hit restores and fresh mermaid.run() output), since morphdom wipes
 * any wrapper this module adds back to raw source/SVG on each doc edit.
 */

interface Transform {
  x: number
  y: number
  scale: number
}

interface Size {
  w: number
  h: number
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8
const WHEEL_STEP = 1.12
const BUTTON_STEP = 1.25

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function applyTransform(stage: HTMLElement, t: Transform): void {
  stage.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`
}

/** Scales content to fit (never upscaling past 1:1) and centers it in the current viewport size. */
function fitTransform(viewport: HTMLElement, content: Size): Transform {
  const vw = viewport.clientWidth || content.w
  const vh = viewport.clientHeight || content.h
  const scale = Math.min(1, vw / content.w, vh / content.h) || 1
  return {
    x: (vw - content.w * scale) / 2,
    y: (vh - content.h * scale) / 2,
    scale,
  }
}

interface Controls {
  bar: HTMLElement
  zoomIn: HTMLElement
  zoomOut: HTMLElement
  reset: HTMLElement
  expand?: HTMLElement
  grow?: HTMLElement
  legend?: HTMLElement
  help: HTMLElement
}

/** Lets another module move a diagram without desyncing this one's transform. */
export interface MermaidPanHandle {
  /** Shift the view by a screen-pixel delta. */
  panBy: (dx: number, dy: number) => void
  /** Refit to the viewport's current size — call after anything resizes the
   *  viewport out from under the cached transform (e.g. explorerSync.ts's
   *  width/pin toggle), since fitTransform() otherwise only runs once, at wiring time. */
  reset: () => void
}

/**
 * Handles keyed by the `.mermaid` panel element. The pan/zoom transform lives
 * in a `wireViewport` closure, so writing `stage.style.transform` from outside
 * would be silently overwritten by the next drag. explorerSync uses this to
 * bring a clicked node into view.
 */
const panHandles = new WeakMap<HTMLElement, MermaidPanHandle>()

export function getMermaidPanHandle(el: HTMLElement): MermaidPanHandle | undefined {
  return panHandles.get(el)
}

/**
 * Open/closed choice for a diagram's legend panel, keyed by the `.mermaid`
 * element — same idiom as `panHandles` above, relied on for the same reason:
 * previewRuntime.ts re-reads `el.textContent` from that exact node on every
 * pass, so it survives morphdom even though its children get rebuilt.
 */
const legendOpen = new WeakMap<HTMLElement, boolean>()

function buildControls(doc: Document, withExpand: boolean, withLegend: boolean): Controls {
  const bar = doc.createElement('div')
  bar.className = 'em-mermaid__controls'

  const makeButton = (label: string, action: string, title: string): HTMLButtonElement => {
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'em-mermaid__btn'
    btn.dataset.action = action
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.textContent = label
    bar.appendChild(btn)
    return btn
  }

  const zoomOut = makeButton('−', 'zoom-out', 'Zoom out')
  const reset = makeButton('⟳', 'reset', 'Reset view')
  const zoomIn = makeButton('+', 'zoom-in', 'Zoom in')
  const grow = withExpand ? makeButton('⇕', 'grow', 'Grow to full height (f)') : undefined
  const expand = withExpand ? makeButton('⤢', 'expand', 'Expand') : undefined
  const legend = withLegend ? makeButton('▤', 'legend', 'Toggle legend') : undefined
  // ponytail: guide is a native title tooltip (hover), same mechanism every
  // other button already uses — no popover component needed for one block of text.
  const help = makeButton(
    '?',
    'help',
    [
      withExpand ? 'Scroll: zoom (click diagram first to enable)' : 'Scroll: zoom',
      'Right-drag: pan',
      'Double right-click: reset view',
      'Esc to disable (to scroll page instead of zooming)',
      'F: grow to full height (after clicking diagram to activate it)',
    ].join('\n'),
  )

  return { bar, zoomIn, zoomOut, reset, expand, grow, legend, help }
}

/**
 * Only one inline diagram's wheel-zoom is "activated" (click-to-enable) at a
 * time, so scrolling the page past a diagram doesn't hijack the wheel.
 * A single document-level listener (installed once) deactivates the current
 * one on any click outside it.
 */
let activeZoomGate: { viewport: HTMLElement; setActive: (v: boolean) => void } | null = null
let deactivateListenerInstalled = false

function ensureDeactivateListener(doc: Document): void {
  if (deactivateListenerInstalled) return
  deactivateListenerInstalled = true
  doc.addEventListener(
    'pointerdown',
    e => {
      if (activeZoomGate && !activeZoomGate.viewport.contains(e.target as Node)) {
        activeZoomGate.setActive(false)
        activeZoomGate = null
      }
    },
    true,
  )
  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeZoomGate) {
      activeZoomGate.setActive(false)
      activeZoomGate = null
    }
  })
}

/**
 * Wires wheel-zoom, drag-to-pan, dblclick/button reset, and expand onto a
 * viewport. When `gateZoom` is set, wheel-zoom stays off (page scrolls
 * normally) until the user clicks the diagram to activate it — skipped for
 * the fullscreen modal, which has no surrounding page to fight over scroll.
 */
function wireViewport(
  viewport: HTMLElement,
  stage: HTMLElement,
  controls: Controls,
  content: Size,
  gateZoom: boolean,
  onExpand?: () => void,
): MermaidPanHandle {
  let t = fitTransform(viewport, content)
  applyTransform(stage, t)

  const zoomAt = (nextScale: number, cx: number, cy: number) => {
    const clamped = clampScale(nextScale)
    const ratio = clamped / t.scale
    t = { x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio, scale: clamped }
    applyTransform(stage, t)
  }

  const reset = () => {
    t = fitTransform(viewport, content)
    applyTransform(stage, t)
  }

  let active = !gateZoom
  const setActive = (v: boolean) => {
    active = v
    viewport.classList.toggle('em-mermaid__viewport--active', v)
  }
  if (gateZoom) {
    const doc = viewport.ownerDocument
    ensureDeactivateListener(doc)
    viewport.title = 'Click to enable scroll-to-zoom'
  }

  viewport.addEventListener(
    'wheel',
    e => {
      if (!active) return // let the page scroll normally until activated
      e.preventDefault()
      const rect = viewport.getBoundingClientRect()
      zoomAt(t.scale * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), e.clientX - rect.left, e.clientY - rect.top)
    },
    { passive: false },
  )

  let dragging = false
  let lastX = 0
  let lastY = 0
  let lastRightClickAt = 0
  const DBLCLICK_MS = 400
  viewport.addEventListener('contextmenu', e => e.preventDefault()) // right button drags instead of opening the menu
  viewport.addEventListener('pointerdown', e => {
    if (gateZoom && !active) {
      activeZoomGate?.setActive(false)
      setActive(true)
      activeZoomGate = { viewport, setActive }
    }
    if (e.button !== 2) return // left button: leave native text selection alone
    e.preventDefault()

    // Chromium doesn't reliably fire 'dblclick' for the right button, so
    // detect it by hand from consecutive right-button pointerdowns.
    const now = e.timeStamp
    if (now - lastRightClickAt < DBLCLICK_MS) {
      lastRightClickAt = 0
      reset()
      return
    }
    lastRightClickAt = now

    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    viewport.setPointerCapture(e.pointerId)
    viewport.classList.add('em-mermaid__viewport--dragging')
  })
  viewport.addEventListener('pointermove', e => {
    if (!dragging) return
    t.x += e.clientX - lastX
    t.y += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    applyTransform(stage, t)
  })
  const endDrag = () => {
    dragging = false
    viewport.classList.remove('em-mermaid__viewport--dragging')
  }
  viewport.addEventListener('pointerup', endDrag)
  viewport.addEventListener('pointerleave', endDrag)

  controls.zoomIn.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect()
    zoomAt(t.scale * BUTTON_STEP, rect.width / 2, rect.height / 2)
  })
  controls.zoomOut.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect()
    zoomAt(t.scale / BUTTON_STEP, rect.width / 2, rect.height / 2)
  })
  controls.reset.addEventListener('click', reset)
  controls.expand?.addEventListener('click', () => onExpand?.())

  return {
    panBy(dx, dy) {
      // `t.x`/`t.y` are in unscaled parent pixels — the transform is
      // `translate(x,y) scale(s)`, so a screen-pixel delta maps 1:1.
      t.x += dx
      t.y += dy
      applyTransform(stage, t)
    },
    reset,
  }
}

let activeModalClose: (() => void) | null = null

/** Moves `svg` into a fullscreen overlay with its own pan/zoom, returning it to `originalStage` on close. */
function openModal(doc: Document, svg: SVGElement, originalStage: HTMLElement, content: Size): void {
  activeModalClose?.()

  const overlay = doc.createElement('div')
  overlay.className = 'em-mermaid-modal'

  const panel = doc.createElement('div')
  panel.className = 'em-mermaid-modal__panel'

  const controls = buildControls(doc, false, false)
  const closeBtn = doc.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'em-mermaid-modal__close'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.textContent = '×'

  const viewport = doc.createElement('div')
  viewport.className = 'em-mermaid__viewport em-mermaid__viewport--modal'
  const stage = doc.createElement('div')
  stage.className = 'em-mermaid__stage'

  stage.appendChild(svg)
  viewport.appendChild(stage)
  panel.appendChild(controls.bar)
  panel.appendChild(closeBtn)
  panel.appendChild(viewport)
  overlay.appendChild(panel)
  doc.body.appendChild(overlay)

  wireViewport(viewport, stage, controls, content, false)

  const close = () => {
    // ponytail: if the doc was edited while the modal was open, originalStage
    // may already be detached (renderMermaid rebuilt it) — svg just lands in
    // a detached node instead of the live DOM, which is harmless since that
    // render pass already produced its own fresh svg.
    originalStage.appendChild(svg)
    overlay.remove()
    doc.removeEventListener('keydown', onKey)
    if (activeModalClose === close) activeModalClose = null
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  doc.addEventListener('keydown', onKey)
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close()
  })

  activeModalClose = close
}

const DEFAULT_PANEL_HEIGHT_MIN = 120
const DEFAULT_PANEL_HEIGHT_MAX = 640

/**
 * Wraps every rendered `.mermaid > svg` with a pan/zoom viewport and control
 * bar. Idempotent to call repeatedly, but expects `blocks` to be freshly
 * (re)rendered — i.e. each element's only child is the mermaid `<svg>`, not
 * an already-wrapped viewport (true right after renderMermaid resets innerHTML).
 */
export function enhanceMermaidZoom(blocks: HTMLElement[]): void {
  blocks.forEach(el => {
    const svg = el.querySelector<SVGSVGElement>('svg')
    if (!svg) return // parse error — nothing to wrap

    const doc = el.ownerDocument

    // A paired legend panel, if this diagram sits inside a :::legend-rendered
    // wrapper (see legend.ts) — sibling only, never a child of `el`, since
    // previewRuntime.ts reads `el`'s own textContent as the diagram source.
    const legendPanel = el.parentElement?.classList.contains('em-legend-wrap')
      ? el.parentElement.querySelector<HTMLElement>(':scope > .em-mermaid__legend')
      : null

    // Pin the svg to its own natural pixel size (from mermaid's viewBox) so
    // pan/zoom transforms have an unambiguous, crisp base to scale from —
    // mermaid's own responsive width:100%/max-width would otherwise resolve
    // against whatever shrink-to-fit size our wrapper divs end up with.
    const box = svg.viewBox?.baseVal
    const rect = box && box.width && box.height ? null : svg.getBoundingClientRect()
    const content: Size = {
      w: box?.width || rect?.width || 100,
      h: box?.height || rect?.height || 100,
    }
    svg.style.width = `${content.w}px`
    svg.style.height = `${content.h}px`
    svg.style.maxWidth = 'none'

    const viewport = doc.createElement('div')
    viewport.className = 'em-mermaid__viewport'
    const stage = doc.createElement('div')
    stage.className = 'em-mermaid__stage'
    stage.appendChild(svg)
    viewport.appendChild(stage)
    el.appendChild(viewport)

    const controls = buildControls(doc, true, !!legendPanel)
    el.appendChild(controls.bar)

    // Restore the open/closed choice from the previous render pass (this
    // whole function reruns on every doc edit, cache hit or miss — see the
    // file doc comment), then let clicks flip it going forward.
    if (legendPanel && controls.legend) {
      const wasOpen = legendOpen.get(el) ?? false
      legendPanel.hidden = !wasOpen
      controls.legend.classList.toggle('em-mermaid__btn--active', wasOpen)
      controls.legend.addEventListener('click', () => {
        const nextOpen = legendPanel.hidden
        legendPanel.hidden = !nextOpen
        controls.legend!.classList.toggle('em-mermaid__btn--active', nextOpen)
        legendOpen.set(el, nextOpen)
      })
    }

    // Default panel height: fit the diagram's own aspect ratio at the
    // panel's current width, so the first render needs no zoom/pan to read.
    // Skipped once the user has manually resized the panel (native
    // `resize: vertical` sets an inline height on `el`).
    if (!el.style.height) {
      const fitScale = Math.min(1, el.clientWidth / content.w) || 1
      const height = Math.min(DEFAULT_PANEL_HEIGHT_MAX, Math.max(DEFAULT_PANEL_HEIGHT_MIN, content.h * fitScale))
      el.style.height = `${height}px`
    }

    const handle = wireViewport(viewport, stage, controls, content, true, () =>
      openModal(doc, svg, stage, content),
    )
    panHandles.set(el, handle)

    // "Grow" is a one-way resize of the resizable panel itself (distinct from
    // "expand", which pops a fullscreen modal): fill the browser viewport
    // height minus top/bottom margin, refit the diagram to the new size via
    // the existing reset button, then scroll it into view. Centering the
    // scroll leaves ~marginY of gap on both edges since the panel height is
    // already viewport-height minus 2*marginY.
    const grow = () => {
      const marginY = 24 // ponytail: mirrors --sp-lg; not read from CSS to avoid a rem->px lookup for one number
      el.style.height = `${Math.max(DEFAULT_PANEL_HEIGHT_MIN, window.innerHeight - marginY * 2)}px`
      controls.reset.click()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    controls.grow?.addEventListener('click', grow)
    // "f" shortcut fires only for the diagram the user has clicked into scroll-zoom
    // activation on (em-mermaid__viewport--active, toggled by setActive in wireViewport) —
    // reuses that existing gate instead of adding separate focus/hover tracking.
    doc.addEventListener('keydown', e => {
      if (e.key.toLowerCase() === 'f' && viewport.classList.contains('em-mermaid__viewport--active')) grow()
    })
  })
}
