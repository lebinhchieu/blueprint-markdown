/**
 * exportHtml.ts — "Blueprint Markdown: Export to HTML" command.
 *
 * Renders the active Markdown document through the same pipeline used by the
 * preview (installEnhancedMarkdown → markdown-it → HTML), then assembles a
 * portable .html file that anyone can open in a browser without the extension.
 *
 * What goes into the output file:
 *   - All media/*.css files inlined in a <style> tag.
 *   - fonts.css with its @font-face blocks stripped; fonts (DM Sans, Playfair
 *     Display, JetBrains Mono, Material Symbols) loaded from Google Fonts CDN.
 *   - dist/export-client.js (hydrate + mermaid-init only, ~7 KB) inlined.
 *   - A mermaid CDN <script> injected *only* when the doc contains a diagram.
 *   - Syntax highlighting is server-rendered (hljs); no client JS needed for it.
 *   - <body data-em-theme="…"> stamped at export time so CSS applies before JS runs.
 *
 * Known limitations:
 *   - Needs network for fonts, icons (Google Fonts CDN) and mermaid diagrams
 *     (jsDelivr CDN). Layout, components, and code highlighting work offline.
 *   - The markdown-it config {html:true, linkify:true} approximates VS Code's
 *     built-in preview but does not mirror every workspace setting.
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import MarkdownIt from 'markdown-it'
import { installEnhancedMarkdown } from '../markdownItPlugin'

// CSS files to inline, in manifest order.
// fonts.css is handled separately (strip @font-face, replace with CDN).
const CSS_FILES = [
  'reset.css',
  'tokens.css',
  'base.css',
  'components.css',
  'em-theme.css',
  'hljs.css',
]

// Google Fonts URL covering all four families used by the extension.
const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=DM+Sans:ital,opsz,wght@0,9..40,100..900;1,9..40,100..900' +
  '&family=Playfair+Display:ital,wght@0,400..700;1,400..700' +
  '&family=JetBrains+Mono:wght@400;500' +
  '&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' +
  '&display=swap'

/** Strip all @font-face { … } blocks from a CSS string. */
function stripFontFace(css: string): string {
  // Matches @font-face { ... } including nested braces (there are none in practice,
  // but be safe). The regex removes the block plus any surrounding whitespace.
  return css.replace(/@font-face\s*\{[^}]*\}\s*/g, '')
}

/** Escape </script occurrences so the JS can be safely inlined. */
function escapeScriptClose(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script')
}

/** Read a file from the extension's media or dist directory. */
function readExtFile(extensionPath: string, ...parts: string[]): string {
  return fs.readFileSync(path.join(extensionPath, ...parts), 'utf8')
}

export async function exportToHtml(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Resolve active markdown document ──────────────────────────────────────
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage(
      'Blueprint Markdown: No Markdown file is active. Open and focus a .md file first.',
    )
    return
  }
  const document = editor.document

  // ── 2. Render the markdown body ───────────────────────────────────────────────
  // Create a fresh markdown-it instance and install the same plugin as the preview.
  // This re-uses: custom directive rendering, hljs fence, inline directives, and
  // the em_theme_marker core rule that injects <div class="em-theme-config" …>.
  const md = installEnhancedMarkdown(
    new MarkdownIt({ html: true, linkify: true }),
  )
  const body = md.render(document.getText())

  // ── 3. Extract theme from the injected marker ─────────────────────────────────
  const themeMatch = body.match(/data-em-theme="([^"]+)"/)
  const theme = themeMatch ? themeMatch[1] : 'light'

  // ── 4. Build inlined CSS ──────────────────────────────────────────────────────
  const extPath = context.extensionPath

  const mainCss = CSS_FILES.map(file => {
    try {
      return readExtFile(extPath, 'media', file)
    } catch {
      // Non-fatal: skip a missing file (e.g. hljs.css not yet built)
      return `/* ${file} not found */`
    }
  }).join('\n')

  // fonts.css: keep the .material-symbols-outlined helper class but drop @font-face
  // (those reference ./fonts/*.woff2 which won't exist beside the exported HTML).
  let fontsCss = ''
  try {
    fontsCss = stripFontFace(readExtFile(extPath, 'media', 'fonts.css'))
  } catch {
    // fonts.css not found — CDN link still loads the fonts
  }

  const inlinedCss = mainCss + '\n' + fontsCss

  // ── 5. Read browser script ────────────────────────────────────────────────────
  // export-client.js is tiny (~7 KB): hydration + mermaid theme-init only.
  // Mermaid itself comes from CDN below — no multi-MB bundle inlined.
  let exportClientJs = ''
  try {
    exportClientJs = escapeScriptClose(readExtFile(extPath, 'dist', 'export-client.js'))
  } catch {
    vscode.window.showErrorMessage(
      'Blueprint Markdown: dist/export-client.js not found — run "npm run build" first.',
    )
    return
  }

  // ── 6. Assemble HTML ──────────────────────────────────────────────────────────
  const title = path.basename(document.fileName, path.extname(document.fileName))

  // Inject the mermaid CDN script only when the document actually has diagrams.
  // Placed before the inline client so window.mermaid is available immediately.
  const hasMermaid = /class="mermaid"/.test(body)
  const mermaidScript = hasMermaid
    ? `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>\n`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>
${inlinedCss}
</style>
</head>
<body class="md-output" data-em-theme="${escapeAttr(theme)}">
${body}
${mermaidScript}<script>
${exportClientJs}
</script>
</body>
</html>`

  // ── 7. Prompt for save location ───────────────────────────────────────────────
  const defaultUri = vscode.Uri.file(
    path.join(
      path.dirname(document.fileName),
      path.basename(document.fileName, path.extname(document.fileName)) + '.html',
    ),
  )
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'HTML file': ['html'] },
    title: 'Export Blueprint Markdown to HTML',
  })
  if (!saveUri) return   // user cancelled

  // ── 8. Write file ─────────────────────────────────────────────────────────────
  await vscode.workspace.fs.writeFile(saveUri, Buffer.from(html, 'utf8'))

  // ── 9. Notify ─────────────────────────────────────────────────────────────────
  const action = await vscode.window.showInformationMessage(
    `Exported to ${path.basename(saveUri.fsPath)}`,
    'Open File',
    'Reveal in Folder',
  )
  if (action === 'Open File') {
    await vscode.env.openExternal(saveUri)
  } else if (action === 'Reveal in Folder') {
    await vscode.commands.executeCommand('revealFileInOS', saveUri)
  }
}

/** Minimal HTML-entity escape for text dropped into a <title>. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Escape double-quotes for use inside an HTML attribute value. */
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
