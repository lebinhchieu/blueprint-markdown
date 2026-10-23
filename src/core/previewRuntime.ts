/**
 * previewRuntime.ts — Shared browser runtime for the VS Code preview and the
 * exported HTML artifact.
 *
 * Mermaid is accepted as a parameter (never imported here) so this module can
 * be bundled without pulling in the heavy library.
 * - preview.ts      passes its statically-bundled instance.
 * - exportClient.ts passes window.mermaid (loaded from CDN), or undefined.
 */

import { hydrate } from './hydrate'
import { setupToc } from './toc'
import { enhanceMermaidZoom } from './mermaidPanZoom'
import { setupExplorers } from './explorerSync'
import { setupMarkers } from './markers'

export type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  run: (opts: { nodes: HTMLElement[] }) => Promise<void>
}

// ─── Theme ────────────────────────────────────────────────────────────────────

/**
 * Read the injected .em-theme-config marker, stamp body[data-em-theme], and
 * return the resolved theme string.  The marker is written by the
 * em_theme_marker core rule in markdownItPlugin.ts on every render.
 */
export function applyTheme(root: HTMLElement): string {
  const marker = root.ownerDocument.querySelector<HTMLElement>('.em-theme-config')
  const theme = marker?.getAttribute('data-em-theme') || root.getAttribute('data-em-theme') || 'light'
  root.setAttribute('data-em-theme', theme)
  const force = marker?.getAttribute('data-em-force-motion')
  if (force) root.ownerDocument.documentElement.setAttribute('data-em-force-motion', force)
  return theme
}

/** Returns true when the hex/rgb colour resolves to a dark background.
 *  Handles #rgb, #rrggbb, rgb(r,g,b), rgba(r,g,b,a).
 *  Falls back to `fallback` when the value can't be parsed. */
export function isDarkColor(value: string, fallback: boolean): boolean {
  let r: number, g: number, b: number
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/(.)/g, '$1$1') : hex[1]
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    const rgb = value.match(/rgba?\(\s*([^)]+)\)/)
    if (!rgb) return fallback
    const parts = rgb[1].split(',').map(n => parseFloat(n))
    ;[r, g, b] = parts
  }
  // Perceived luminance (sRGB approximation); < 0.5 → dark background
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

// ─── Mermaid ──────────────────────────────────────────────────────────────────

/**
 * Cache of `${theme}\n${source}` → rendered SVG innerHTML.
 * Theme is part of the key so a theme switch invalidates all entries.
 * Note: two identical diagram sources in one document share one cache entry
 * and receive the same SVG (same internal element ids) — rare in practice.
 */
const svgCache = new Map<string, string>()
const SVG_CACHE_CAP = 60

function svgCacheSet(key: string, value: string): void {
  if (svgCache.size >= SVG_CACHE_CAP) {
    const oldest = svgCache.keys().next().value
    if (oldest !== undefined) svgCache.delete(oldest)
  }
  svgCache.set(key, value)
}

/**
 * Resolve `var(--x)` to its computed literal value before handing the source
 * to mermaid. Confirmed by hand: mermaid's own classDef/style grammar doesn't
 * accept parentheses in a style value at all — `fill:var(--c-primary)` renders
 * mermaid's own error diagram even with securityLevel:'loose', while
 * `fill:#c05a28` parses fine. This keeps the documented `var(--c-primary)`
 * authoring syntax (see blueprint-markdown's syntax.md) working by feeding
 * mermaid something its grammar actually accepts, instead of asking authors
 * to hardcode theme-specific hex values.
 * ponytail: no fallback-value `var(--x, #fff)` support — nothing in this repo
 * writes one; add if that syntax shows up in a diagram.
 */
function resolveCssVars(source: string, v: (name: string) => string): string {
  return source.replace(/var\(\s*(--[\w-]+)\s*\)/g, (whole, name) => v(name) || whole)
}

/**
 * Mermaid and the pan/zoom fit both measure the DOM (getBBox, clientWidth), and
 * an inactive `.tab-panel` is display:none — measured there, a diagram comes
 * back as a 16×16 viewBox and stays blank after the tab opens. Lay such panels
 * out invisibly and zero-height for the duration of the render, then undo.
 */
function revealTabPanels(blocks: HTMLElement[]): () => void {
  const panels = new Set<HTMLElement>()
  blocks.forEach(el => {
    const panel = el.closest<HTMLElement>('.tab-panel:not([data-active])')
    if (panel) panels.add(panel)
  })
  panels.forEach(p => {
    p.style.cssText += ';display:block;visibility:hidden;height:0;padding-block:0;overflow:hidden'
  })
  return () => panels.forEach(p => {
    p.style.removeProperty('display')
    p.style.removeProperty('visibility')
    p.style.removeProperty('height')
    p.style.removeProperty('padding-block')
    p.style.removeProperty('overflow')
  })
}

// ── Lazy rendering ────────────────────────────────────────────────────────────
//
// Rendering every diagram on init blocks the main thread (mermaid.run is
// synchronous-heavy per diagram) and hangs the preview on large docs. Instead:
// cache hits are restored synchronously (no flicker on morphdom re-runs); cache
// misses get an empty placeholder (.mermaid has min-height) and are rendered one
// at a time, nearest-the-top first, as an IntersectionObserver reports them
// within ~1 viewport. Blocks inside an inactive `.tab-panel` are display:none,
// so they never intersect — they render when the tab opens and the observer
// fires (revealTabPanels still guards the measurement). Blocks inside
// `.em-explorer` render eagerly: explorerSync pairs SVG nodes right after the
// first batch and would otherwise see an empty pin.

interface Pending { source: string; key: string }

/** Blocks awaiting render in the current pass (cleared each pass). */
let pend = new Map<HTMLElement, Pending>()
let queue: HTMLElement[] = []
let observer: IntersectionObserver | null = null
let gen = 0
let cur: { theme: string; mermaid: MermaidApi; v: (n: string) => string } | null = null
let worker: Promise<void> | null = null
/** The mermaid.run currently in flight; a new pass waits for it before writing the DOM. */
let inflight: Promise<unknown> | null = null
let idleWaiters: Array<() => void> = []
let initKey = ''
let fontsReady: Promise<void> | null = null

const yieldToBrowser = () => new Promise<void>(r => setTimeout(r, 0))

function waitIdle(): Promise<void> {
  return worker ? new Promise<void>(r => idleWaiters.push(r)) : Promise.resolve()
}

function enqueue(el: HTMLElement): void {
  if (!pend.has(el) || queue.includes(el)) return
  queue.push(el)
  queue.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  kick()
}

function kick(): void {
  if (worker) return
  worker = work()
}

async function work(): Promise<void> {
  for (;;) {
    const el = queue.shift()
    if (!el) {
      // Sync check-and-clear: a kick() after this line starts a fresh worker.
      worker = null
      idleWaiters.splice(0).forEach(r => r())
      return
    }
    const info = pend.get(el)
    if (!info || !cur || !el.isConnected) continue
    // One bad block must not kill the worker: `worker` would stay set and every
    // later lazy render would silently stop.
    await renderOne(el, info, cur).catch(() => {})
    await yieldToBrowser()
  }
}

function loadFonts(): Promise<void> {
  // Wait for DM Sans before mermaid measures text widths.
  return (fontsReady ??= (async () => {
    try {
      await Promise.all([
        document.fonts.load('400 1em "DM Sans"'),
        document.fonts.load('700 1em "DM Sans"'),
      ])
      await document.fonts.ready
    } catch {
      // Font API unavailable — render anyway
    }
  })())
}

async function renderOne(
  el: HTMLElement,
  info: Pending,
  c: NonNullable<typeof cur>,
): Promise<void> {
  const myGen = gen
  const restore = revealTabPanels([el])
  try {
    initMermaid(c.mermaid, c.theme, c.v)
    await loadFonts()
    el.innerHTML = info.source
    delete el.dataset['processed']
    inflight = c.mermaid.run({ nodes: [el] }).catch(() => {
      // Mermaid parse errors are non-fatal
    })
    await inflight
    inflight = null
    // A newer pass (morphdom) may have reset this element mid-run.
    if (myGen !== gen || pend.get(el) !== info) return
    svgCacheSet(info.key, el.innerHTML)
    pend.delete(el)
    observer?.unobserve(el)
    enhanceMermaidZoom([el])
  } finally {
    restore()
  }
}

/** mermaid.initialize is global: once per theme/colour change, not per block. */
function initMermaid(mermaid: MermaidApi, theme: string, v: (n: string) => string): void {
  const key = `${theme}|${v('--bg-base')}|${v('--text-base')}|${v('--c-primary')}`
  if (key === initKey) return
  initKey = key
  const isDark = isDarkColor(v('--bg-base'), theme !== 'light')

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      darkMode:             isDark,

      background:           v('--bg-raised')        || (isDark ? '#2d2820' : '#fdf9f4'),
      fontFamily:           v('--font-sans')         || 'system-ui, sans-serif',

      primaryColor:         v('--bg-overlay')        || (isDark ? '#363028' : '#ece5d8'),
      mainBkg:              v('--bg-overlay')        || (isDark ? '#363028' : '#ece5d8'),
      secondaryColor:       v('--c-info-bg')         || (isDark ? '#0e1c28' : '#dff1f8'),
      tertiaryColor:        v('--c-success-bg')      || (isDark ? '#0e2018' : '#e4f2ea'),
      primaryBorderColor:   v('--c-primary')         || (isDark ? '#e8845a' : '#c05a28'),
      nodeBorder:           v('--c-primary')         || (isDark ? '#e8845a' : '#c05a28'),
      secondaryBorderColor: v('--border-color')      || (isDark ? '#3d3528' : '#ddd4c4'),
      tertiaryBorderColor:  v('--border-color')      || (isDark ? '#3d3528' : '#ddd4c4'),
      primaryTextColor:     v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      secondaryTextColor:   v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      tertiaryTextColor:    v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      textColor:            v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      titleColor:           v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      nodeTextColor:        v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),

      lineColor:            v('--text-muted')        || (isDark ? '#9e8e7a' : '#7a6954'),
      edgeLabelBackground:  v('--bg-raised')         || (isDark ? '#2d2820' : '#fdf9f4'),

      clusterBkg:           v('--bg-surface')        || (isDark ? '#252018' : '#f2ebe0'),
      clusterBorder:        v('--border-color')      || (isDark ? '#3d3528' : '#ddd4c4'),

      actorBkg:             v('--bg-overlay')        || (isDark ? '#363028' : '#ece5d8'),
      actorBorder:          v('--c-primary')         || (isDark ? '#e8845a' : '#c05a28'),
      actorTextColor:       v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      actorLineColor:       v('--text-faint')        || (isDark ? '#6a5e50' : '#b0a090'),
      signalColor:          v('--text-muted')        || (isDark ? '#9e8e7a' : '#7a6954'),
      signalTextColor:      v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      labelBoxBkgColor:     v('--bg-overlay')        || (isDark ? '#363028' : '#ece5d8'),
      labelBoxBorderColor:  v('--border-color')      || (isDark ? '#3d3528' : '#ddd4c4'),
      labelTextColor:       v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      loopTextColor:        v('--text-base')         || (isDark ? '#f0e8d8' : '#2c2018'),
      activationBkgColor:   v('--bg-overlay')        || (isDark ? '#363028' : '#ece5d8'),
      activationBorderColor:v('--c-primary')         || (isDark ? '#e8845a' : '#c05a28'),
      sequenceNumberColor:  v('--text-on-solid')     || '#ffffff',

      noteBkgColor:         v('--c-warning-bg')      || (isDark ? '#201408' : '#fdf2d8'),
      noteBorderColor:      v('--c-warning')         || (isDark ? '#d4924a' : '#b07220'),
      noteTextColor:        v('--c-warning-text')    || (isDark ? '#e8b878' : '#8a5610'),

      altBackground:        v('--bg-surface')        || (isDark ? '#252018' : '#f2ebe0'),
    },
  })
}

/**
 * Resolves once the first batch is rendered: every cache hit, every eager
 * block, and every block within ~1 viewport of the initial scroll position.
 * Off-screen diagrams keep rendering later as they near the viewport.
 */
export async function renderMermaid(
  root: HTMLElement,
  theme: string,
  mermaid: MermaidApi,
): Promise<void> {
  // New pass: morphdom reset every block, so drop the previous pass's state.
  gen++
  observer?.disconnect()
  observer = null
  pend = new Map()
  queue = []

  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
  if (blocks.length === 0) return

  // resolveCssVars needs the computed style up front, so the cache key reflects
  // the resolved text.
  const css = getComputedStyle(root.ownerDocument.body)
  const v = (name: string) => css.getPropertyValue(name).trim()
  cur = { theme, mermaid, v }

  // Read every source now (sync), but write the DOM only after any in-flight
  // mermaid.run settles: that run targets an element morphdom already reset and
  // would otherwise land its stale SVG on top of what this pass restores.
  const plan = blocks.map(el => {
    // After morphdom, the block contains the raw source text (HTML-escaped by
    // fence.ts). textContent gives the decoded string that mermaid can parse.
    const source = resolveCssVars((el.textContent ?? '').trim(), v)
    const key = `${theme}\n${source}`
    return { el, source, key, cached: svgCache.get(key) }
  })
  if (inflight) {
    const myGen = gen
    await inflight
    if (myGen !== gen) return // a newer pass owns the DOM now
  }

  const hits: HTMLElement[] = []
  const eager: HTMLElement[] = []
  const lazy: HTMLElement[] = []

  plan.forEach(({ el, source, key, cached }) => {
    if (cached !== undefined) {
      el.innerHTML = cached
      el.dataset.processed = 'true'
      hits.push(el)
      return
    }
    // Empty placeholder (min-height keeps the layout); source is stashed in
    // `pend` and handed to mermaid at render time.
    el.textContent = ''
    delete el.dataset['processed']
    pend.set(el, { source, key })
    ;(el.closest('.em-explorer') || typeof IntersectionObserver === 'undefined' ? eager : lazy).push(el)
  })

  if (hits.length) {
    const restore = revealTabPanels(hits)
    try { enhanceMermaidZoom(hits) } finally { restore() }
  }
  if (pend.size === 0) return

  // Configure before anything async: mermaid.min.js auto-runs on DOMContentLoaded
  // unless startOnLoad is already false, which would render every block at once.
  initMermaid(mermaid, theme, v)
  eager.forEach(enqueue)

  if (lazy.length) {
    let firstBatch!: () => void
    const first = new Promise<void>(r => (firstBatch = r))
    observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const el = e.target as HTMLElement
        if (e.isIntersecting) enqueue(el)
        else queue = queue.filter(q => q !== el) // scrolled past before its turn
      })
      firstBatch()
    }, { rootMargin: '100% 0px' })
    lazy.forEach(el => observer!.observe(el))
    await first
  }
  await waitIdle()
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Shared run function used by both the VS Code preview script and the exported
 * HTML artifact.  Does NOT remove VS Code built-in styles — that's the
 * responsibility of the calling entry point (preview.ts only).
 */
export function runShared(mermaid: MermaidApi | undefined): void {
  const root = document.body
  root.classList.add('md-output')
  const theme = applyTheme(root)
  hydrate(root)
  setupMarkers(root)
  setupToc(root)
  // renderMermaid is async — called unchained, setupExplorers would run before
  // any SVG exists and match nothing.
  if (mermaid) void renderMermaid(root, theme, mermaid).then(() => setupExplorers(root))
}
