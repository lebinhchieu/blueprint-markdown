/**
 * preview.ts — Browser entry point, bundled into dist/preview.js.
 *
 * VS Code injects this as a nonce'd <script> into the preview webview on
 * every content change.  The CSP forbids dynamic import(), so mermaid is
 * bundled statically (not imported lazily).
 *
 * Responsibilities:
 *   - Add 'md-output' class to body so components.css / base.css selectors match.
 *   - Read the injected em-theme-config marker and apply data-em-theme to <body>
 *     so em-theme.css / hljs.css token sets activate before any paint.
 *   - Wire tab switching and accordion collapse via hydrate().
 *   - Render .mermaid blocks using the locally-bundled mermaid instance.
 *
 * Theme:
 *   The extension host resolves the configured theme (enhancedMarkdownPreview.theme)
 *   to 'light' or 'dark' and injects a hidden <div class="em-theme-config"
 *   data-em-theme="..."> at the top of every render.  This script reads that
 *   marker and stamps body[data-em-theme] so CSS and mermaid agree on the theme.
 *   The preview script cannot read VS Code workspace config directly (sandboxed).
 */

import { hydrate } from './core/hydrate'
import mermaid from 'mermaid'

function run(): void {
  const root = document.body

  // Scope bridge: VS Code's preview has no .md-output wrapper element.
  // Adding the class to body lets all .md-output selectors in components.css
  // and base.css match content rendered into body.
  root.classList.add('md-output')

  // Read the theme injected by the extension host and apply it to <body>.
  // em-theme.css is already loaded (as a previewStyle), but the attribute must
  // be present for `body[data-em-theme="dark"]` rules to activate.
  const marker = document.querySelector<HTMLElement>('.em-theme-config')
  const theme = marker?.getAttribute('data-em-theme') || 'light'
  root.setAttribute('data-em-theme', theme)

  // Tab switching + accordion coordinated collapse
  hydrate(root)

  // Mermaid
  renderMermaid(root, theme)
}

function renderMermaid(root: HTMLElement, theme: string): void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))
  if (blocks.length === 0) return

  // Read our CSS token values for theming (resolved after data-em-theme is set)
  const css = getComputedStyle(document.body)
  const v = (name: string) => css.getPropertyValue(name).trim()

  // Detect dark vs light from the resolved --bg-base luminance, so any
  // light-background theme (not only the literal 'light' key) themes Mermaid
  // correctly. Falls back to the name-check if the colour can't be parsed.
  const isDark = isDarkColor(v('--bg-base'), theme !== 'light')

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      darkMode:             isDark,

      // ── Canvas & fonts ──────────────────────────────────────────────────
      background:           v('--bg-raised')        || (isDark ? '#2d2820' : '#fdf9f4'),
      fontFamily:           v('--font-sans')         || 'system-ui, sans-serif',

      // ── Nodes / boxes (flowchart, class, state, ER) ─────────────────────
      // KEY FIX: use --bg-overlay (not --bg-raised) so boxes are
      // visibly distinct from the canvas in every theme.
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

      // ── Lines / edges ────────────────────────────────────────────────────
      // Neutral muted tone so connectors don't compete with the accent borders.
      lineColor:            v('--text-muted')        || (isDark ? '#9e8e7a' : '#7a6954'),
      edgeLabelBackground:  v('--bg-raised')         || (isDark ? '#2d2820' : '#fdf9f4'),

      // ── Clusters / subgraphs ─────────────────────────────────────────────
      clusterBkg:           v('--bg-surface')        || (isDark ? '#252018' : '#f2ebe0'),
      clusterBorder:        v('--border-color')      || (isDark ? '#3d3528' : '#ddd4c4'),

      // ── Sequence diagram ─────────────────────────────────────────────────
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

      // ── Notes ────────────────────────────────────────────────────────────
      noteBkgColor:         v('--c-warning-bg')      || (isDark ? '#201408' : '#fdf2d8'),
      noteBorderColor:      v('--c-warning')         || (isDark ? '#d4924a' : '#b07220'),
      noteTextColor:        v('--c-warning-text')    || (isDark ? '#e8b878' : '#8a5610'),

      // ── Alt / misc ───────────────────────────────────────────────────────
      altBackground:        v('--bg-surface')        || (isDark ? '#252018' : '#f2ebe0'),
    },
  })

  // VS Code re-injects preview scripts on every content change.
  // Restore the original source before each render so re-renders don't
  // corrupt already-SVG'd blocks.
  blocks.forEach(el => {
    if (!el.dataset.source) el.dataset.source = el.textContent ?? ''
    el.innerHTML = el.dataset.source
    delete el.dataset['processed']
  })

  mermaid.run({ nodes: blocks }).catch(() => {
    // Mermaid parse errors are non-fatal; the block stays as text
  })
}

/** Returns true when the hex/rgb colour resolves to a dark background.
 *  Handles #rgb, #rrggbb, rgb(r,g,b), rgba(r,g,b,a).
 *  Falls back to `fallback` when the value can't be parsed. */
function isDarkColor(value: string, fallback: boolean): boolean {
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

// Re-run on each script injection (VS Code reloads on every edit)
run()
