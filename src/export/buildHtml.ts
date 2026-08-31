/**
 * buildHtml.ts — pure HTML-artifact builder shared by "Export to HTML" (exportHtml.ts)
 * and the standalone CLI preview (src/cli/preview.ts). No `vscode` import, so both a VS
 * Code command and a plain Node process can call it.
 *
 * What goes into the output:
 *   - dist/export-styles-{theme}.css (active-theme CSS only, minified, @font-face stripped) inlined.
 *   - Fonts (DM Sans, Playfair Display, JetBrains Mono, Material Symbols) loaded
 *     from Google Fonts CDN.
 *   - dist/export-client.js (hydrate + mermaid init only, ~7 KB) inlined.
 *   - A mermaid CDN <script> injected *only* when the doc contains a diagram.
 *   - Syntax highlighting is server-rendered (hljs); no client JS needed for it.
 *   - <body data-em-theme="…"> stamped so CSS applies before JS runs.
 *   - `extraHead`, verbatim, appended just before </head> — this is how the CLI preview
 *     injects its live-reload/comment client without export.ts needing to know about it.
 *
 * Known limitations:
 *   - Needs network for fonts, icons (Google Fonts CDN) and mermaid diagrams
 *     (jsDelivr CDN). Layout, components, and code highlighting work offline.
 */

import * as fs from 'fs'
import * as path from 'path'
import MarkdownIt from 'markdown-it'
import { installBlueprintMarkdownCore } from '../core/installBlueprintMarkdown'

// Google Fonts URL covering all four families used by the extension.
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=DM+Sans:ital,opsz,wght@0,9..40,100..900;1,9..40,100..900' +
  '&family=Playfair+Display:ital,wght@0,400..700;1,400..700' +
  '&family=JetBrains+Mono:wght@400;500' +
  '&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' +
  '&display=swap'

/** Escape </script occurrences so the JS can be safely inlined. */
function escapeScriptClose(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script')
}

/** Minimal HTML-entity escape for text dropped into a <title>. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape double-quotes for use inside an HTML attribute value. */
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

export interface BuildHtmlOptions {
  source: string
  theme: string
  toc: string
  /** Directory containing export-styles-{theme}.css and export-client.js (esbuild's dist/). */
  distDir: string
  title?: string
  /** Injected verbatim just before </head> — e.g. the CLI's live-reload/comment client. */
  extraHead?: string
  workspaceFolders?: string[]
  /** Set by the CLI preview only — see InstallOptions.stampLineNumbers for why. */
  interactive?: boolean
}

/** Thrown when a required build artifact is missing — callers translate this to their own
 *  UI (vscode.window.showErrorMessage, or a plain console.error for the CLI). */
export class MissingArtifactError extends Error {}

export function buildHtml(opts: BuildHtmlOptions): string {
  const md = installBlueprintMarkdownCore(
    new MarkdownIt({ html: true, linkify: true }),
    {
      getTheme: () => opts.theme,
      getToc: () => opts.toc,
      getWorkspaceFolders: opts.workspaceFolders ? () => opts.workspaceFolders! : undefined,
      stampLineNumbers: opts.interactive,
    },
  )
  const rendered = md.render(opts.source)

  // Strip the hidden em-theme-config marker div — it's only needed by the live
  // preview runtime to detect a theme change after install time. This export stamps
  // the (already-known) theme directly on <body data-em-theme> below instead.
  const body = rendered.replace(/<div class="em-theme-config"[^>]*hidden[^>]*><\/div>\n?/, '')

  // export-styles-{theme}.css is pre-built and minified by esbuild.mjs (Step 3.75).
  // Contains base CSS + active theme overrides + matching hljs variant only.
  let inlinedCss: string
  try {
    inlinedCss = fs.readFileSync(path.join(opts.distDir, `export-styles-${opts.theme}.css`), 'utf8')
  } catch {
    throw new MissingArtifactError(`dist/export-styles-${opts.theme}.css not found — run "npm run build" first.`)
  }

  // export-client.js is tiny (~7 KB): hydration + mermaid theme-init only.
  // Mermaid itself comes from CDN below — no multi-MB bundle inlined.
  let exportClientJs: string
  try {
    exportClientJs = escapeScriptClose(fs.readFileSync(path.join(opts.distDir, 'export-client.js'), 'utf8'))
  } catch {
    throw new MissingArtifactError('dist/export-client.js not found — run "npm run build" first.')
  }

  // Inject the mermaid CDN script only when the document actually has diagrams.
  // Placed before the inline client so window.mermaid is available immediately.
  const hasMermaid = /class="mermaid"/.test(body)
  const mermaidScript = hasMermaid
    ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>\n`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(opts.title ?? 'Blueprint Markdown')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>
${inlinedCss}
</style>
${opts.extraHead ?? ''}</head>
<body class="md-output" data-em-theme="${escapeAttr(opts.theme)}">
${body}
${mermaidScript}<script>
${exportClientJs}
</script>
</body>
</html>`
}
