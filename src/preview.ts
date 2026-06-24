/**
 * preview.ts — Browser entry point, bundled into dist/preview.js.
 *
 * VS Code injects this as a nonce'd <script> into the preview webview on
 * first load only (since VS Code 1.63 preview scripts are not re-executed on
 * content change — instead a 'vscode.markdown.updateContent' event fires).
 * The CSP forbids dynamic import(), so mermaid is bundled statically.
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

// Drop VS Code's built-in markdown-language-features styles. Both files are
// superseded by our own:
//   - highlight.css (vs2015): competes with our atom-one hljs.css, leaks
//     #DCDCDC into .hljs-params → invisible on light backgrounds.
//   - markdown.css: reset.css already does `all: revert` on every element it
//     styles, so it contributes nothing after our reset loads.
function removeBuiltinStyles(): void {
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    if (/markdown-language-features\/media\/(highlight|markdown)\.css/i.test(link.href)) {
      link.remove()
    }
  })
}

function run(): void {
  removeBuiltinStyles()
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

  // Mermaid (fire-and-forget — async font wait inside)
  void renderMermaid(root, theme)
}

async function renderMermaid(root: HTMLElement, theme: string): Promise<void> {
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

  // On re-runs (via the updateContent event) the .mermaid div contains the
  // edited source text; data-source may hold the previous render's source.
  // Always refresh data-source from current textContent so the re-render
  // uses the latest diagram, then clear the processed marker.
  blocks.forEach(el => {
    // morphdom strips data-source when it patches the element with new content,
    // so textContent here is the fresh diagram source on edits. When morphdom
    // keeps the element unchanged (edit elsewhere in the doc), data-source is
    // still set and we reuse it to avoid re-rendering with stale SVG text.
    if (!el.dataset.source) el.dataset.source = el.textContent ?? ''
    el.innerHTML = el.dataset.source
    delete el.dataset['processed']
  })

  // Ensure DM Sans is loaded before mermaid measures text widths to size
  // each node box. font-display:swap means a fallback font may be active at
  // render time; if mermaid measures with the fallback (narrower) the boxes
  // are undersized and DM Sans overflows them after the swap.
  try {
    await Promise.all([
      document.fonts.load('400 1em "DM Sans"'),
      document.fonts.load('700 1em "DM Sans"'),
    ])
    await document.fonts.ready
  } catch {
    // Font API unavailable — render anyway with whatever font is active
  }

  await mermaid.run({ nodes: blocks }).catch(() => {
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

// Initial run on first load.
run()

// Since VS Code 1.63 contributed preview scripts run only once on first load.
// Subsequent edits update the DOM in place (morphdom) and fire this event
// instead of re-executing the script.  Re-run to re-hydrate components and
// re-render mermaid blocks with the updated source.
window.addEventListener('vscode.markdown.updateContent', () => run())
