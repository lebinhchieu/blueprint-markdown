/**
 * previewRuntime.ts — Shared browser runtime for the VS Code preview and the
 * exported HTML artifact.
 *
 * Mermaid is accepted as a parameter (never imported here) so this module
 * can be bundled without pulling in the multi-MB mermaid library.
 * - preview.ts  passes its statically-bundled mermaid instance.
 * - exportClient.ts passes window.mermaid (loaded from CDN), or undefined.
 */

import { hydrate } from './hydrate'
import { setupToc } from './toc'

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
  const theme = marker?.getAttribute('data-em-theme') || 'light'
  root.setAttribute('data-em-theme', theme)
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

export async function renderMermaid(
  root: HTMLElement,
  theme: string,
  mermaid: MermaidApi,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
  if (blocks.length === 0) return

  // Classify each block as a cache hit or miss.
  const pending: Array<{ el: HTMLElement; key: string }> = []

  blocks.forEach(el => {
    // After morphdom, the block contains the raw source text (HTML-escaped by
    // fence.ts). textContent gives the decoded string that mermaid can parse.
    const source = (el.textContent ?? '').trim()
    const key = `${theme}\n${source}`
    const cached = svgCache.get(key)
    if (cached !== undefined) {
      // Restore the previously rendered SVG — no mermaid work needed.
      el.innerHTML = cached
      el.dataset.processed = 'true'
    } else {
      // Reset to source text so mermaid can parse it, then queue for rendering.
      el.innerHTML = source
      delete el.dataset['processed']
      pending.push({ el, key })
    }
  })

  // If nothing changed, skip initialize/font-load/run entirely.
  if (pending.length === 0) return

  const css = getComputedStyle(root.ownerDocument.body)
  const v = (name: string) => css.getPropertyValue(name).trim()

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

  // Wait for DM Sans before mermaid measures text widths.
  try {
    await Promise.all([
      document.fonts.load('400 1em "DM Sans"'),
      document.fonts.load('700 1em "DM Sans"'),
    ])
    await document.fonts.ready
  } catch {
    // Font API unavailable — render anyway
  }

  await mermaid.run({ nodes: pending.map(p => p.el) }).catch(() => {
    // Mermaid parse errors are non-fatal
  })

  // Cache the rendered SVGs for future incremental updates.
  pending.forEach(p => svgCacheSet(p.key, p.el.innerHTML))
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
  setupToc(root)
  if (mermaid) void renderMermaid(root, theme, mermaid)
}
