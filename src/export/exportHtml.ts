/**
 * exportHtml.ts — "Blueprint Markdown: Export to HTML" command.
 *
 * Renders the active Markdown document through the same pipeline used by the
 * preview (installBlueprintMarkdown → markdown-it → HTML), then assembles a
 * portable .html file that anyone can open in a browser without the extension.
 *
 * What goes into the output file:
 *   - dist/export-styles-{theme}.css (active-theme CSS only, minified, @font-face stripped) inlined.
 *   - Fonts (DM Sans, Playfair Display, JetBrains Mono, Material Symbols) loaded
 *     from Google Fonts CDN.
 *   - dist/export-client.js (hydrate + mermaid init only, ~7 KB) inlined.
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
import { installBlueprintMarkdown } from '../markdownItPlugin'

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

/** Read a file from the extension's media or dist directory. */
function readExtFile(extensionPath: string, ...parts: string[]): string {
  return fs.readFileSync(path.join(extensionPath, ...parts), 'utf8')
}

/**
 * A focused markdown preview with no source editor visible (e.g. Ctrl+Shift+V replaced the
 * tab). The preview's source URI isn't exposed by any API, but the built-in
 * `markdown.showSource` knows it — it opens the source as the active editor (in the
 * preview's group). Returns true when that left a markdown editor active.
 */
async function showSourceOfActivePreview(): Promise<boolean> {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (!(input instanceof vscode.TabInputWebview) || !input.viewType.endsWith('markdown.preview')) return false
  await vscode.commands.executeCommand('markdown.showSource')
  return vscode.window.activeTextEditor?.document.languageId === 'markdown'
}

export async function exportToHtml(context: vscode.ExtensionContext, arg?: { uri?: string }): Promise<void> {
  // ── 1. Resolve active markdown document ──────────────────────────────────────
  // Preview right-click: the webview context carries the exact source URI (see
  // commentInsert.ts) — a focused preview is a webview, so activeTextEditor is unset.
  // Otherwise: a focused markdown editor, else the visible markdown editor(s), else ask
  // the focused preview for its source.
  let document: vscode.TextDocument | undefined
  const activeEditor = vscode.window.activeTextEditor
  if (arg?.uri) {
    document = await vscode.workspace.openTextDocument(vscode.Uri.parse(arg.uri))
  } else if (activeEditor?.document.languageId === 'markdown') {
    document = activeEditor.document
  } else {
    // Dedupe by URI: the same file split across two groups is still one candidate.
    const visible = [...new Map(
      vscode.window.visibleTextEditors
        .filter(e => e.document.languageId === 'markdown')
        .map(e => [e.document.uri.toString(), e.document]),
    ).values()]
    if (visible.length === 1) {
      document = visible[0]
    } else if (visible.length > 1) {
      const picked = await vscode.window.showQuickPick(
        visible.map(d => ({ label: path.basename(d.fileName), description: vscode.workspace.asRelativePath(d.uri), document: d })),
        { placeHolder: 'Blueprint Markdown: which file to export?' },
      )
      if (!picked) return
      document = picked.document
    } else if (await showSourceOfActivePreview()) {
      document = vscode.window.activeTextEditor!.document
      // showSource swapped the preview out of its group; bring it back.
      await vscode.commands.executeCommand('workbench.action.openPreviousRecentlyUsedEditorInGroup')
    } else {
      vscode.window.showErrorMessage(
        'Blueprint Markdown: No Markdown file is open. Open a .md file first.',
      )
      return
    }
  }

  // ── 2. Render the markdown body ───────────────────────────────────────────────
  // Create a fresh markdown-it instance and install the same plugin as the preview.
  // This re-uses: custom directive rendering, hljs fence, inline directives, and
  // the em_theme_marker core rule that injects <div class="em-theme-config" …>.
  const md = installBlueprintMarkdown(
    new MarkdownIt({ html: true, linkify: true }),
  )
  const rendered = md.render(document.getText())

  // ── 3. Extract theme from the injected marker ───────────────────────────────
  const themeMatch = rendered.match(/data-em-theme="([^"]+)"/)
  const theme = themeMatch ? themeMatch[1] : 'light'
  const forceMotion = /data-em-force-motion="true"/.test(rendered)

  // Strip the hidden em-theme-config marker div — it's only needed by the live
  // preview runtime. The export stamps the theme directly on <body data-em-theme>.
  const body = rendered.replace(/<div class="em-theme-config"[^>]*hidden[^>]*><\/div>\n?/, '')

  // ── 4. Build inlined CSS ──────────────────────────────────────────────────────
  const extPath = context.extensionPath

  // export-styles-{theme}.css is pre-built and minified by esbuild.mjs (Step 3.75).
  // Contains base CSS + active theme overrides + matching hljs variant only.
  let inlinedCss = ''
  try {
    inlinedCss = readExtFile(extPath, 'dist', `export-styles-${theme}.css`)
  } catch {
    vscode.window.showErrorMessage(
      `Blueprint Markdown: dist/export-styles-${theme}.css not found — run "npm run build" first.`,
    )
    return
  }

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
<html lang="en" data-em-force-motion="${forceMotion}">
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
<body class="md-output" data-em-theme="${escapeAttr(theme)}" data-em-doc="${escapeAttr(title)}">
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
