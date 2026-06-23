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

  const isDark = theme !== 'light'

  // Read our CSS token values for theming (resolved after data-em-theme is set)
  const css = getComputedStyle(document.body)
  const v = (name: string) => css.getPropertyValue(name).trim()

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      darkMode:             isDark,
      background:           v('--bg-raised')      || (isDark ? '#2d2820' : '#fdf9f4'),
      fontFamily:           v('--font-sans')       || 'system-ui, sans-serif',
      primaryColor:         v('--bg-raised')       || (isDark ? '#2d2820' : '#fdf9f4'),
      mainBkg:              v('--bg-raised')       || (isDark ? '#2d2820' : '#fdf9f4'),
      secondaryColor:       v('--c-info-bg')       || (isDark ? '#0e1c28' : '#dff1f8'),
      tertiaryColor:        v('--c-success-bg')    || (isDark ? '#0e2018' : '#e4f2ea'),
      primaryBorderColor:   v('--border-color')    || (isDark ? '#3d3528' : '#ddd4c4'),
      nodeBorder:           v('--border-color')    || (isDark ? '#3d3528' : '#ddd4c4'),
      secondaryBorderColor: v('--border-color')    || (isDark ? '#3d3528' : '#ddd4c4'),
      tertiaryBorderColor:  v('--border-color')    || (isDark ? '#3d3528' : '#ddd4c4'),
      primaryTextColor:     v('--text-base')       || (isDark ? '#f0e8d8' : '#2c2018'),
      secondaryTextColor:   v('--text-base')       || (isDark ? '#f0e8d8' : '#2c2018'),
      tertiaryTextColor:    v('--text-base')       || (isDark ? '#f0e8d8' : '#2c2018'),
      textColor:            v('--text-base')       || (isDark ? '#f0e8d8' : '#2c2018'),
      titleColor:           v('--text-base')       || (isDark ? '#f0e8d8' : '#2c2018'),
      lineColor:            v('--c-primary')       || (isDark ? '#e8845a' : '#c05a28'),
      edgeLabelBackground:  v('--bg-base')         || (isDark ? '#1c1914' : '#faf6ef'),
      clusterBkg:           v('--bg-surface')      || (isDark ? '#252018' : '#f2ebe0'),
      clusterBorder:        v('--border-color')    || (isDark ? '#3d3528' : '#ddd4c4'),
      noteBkgColor:         v('--c-warning-bg')    || (isDark ? '#201408' : '#fdf2d8'),
      noteBorderColor:      v('--c-warning')       || (isDark ? '#d4924a' : '#b07220'),
      altBackground:        v('--bg-surface')      || (isDark ? '#252018' : '#f2ebe0'),
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

// Re-run on each script injection (VS Code reloads on every edit)
run()
