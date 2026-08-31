/**
 * exportHtml.ts — "Blueprint Markdown: Export to HTML" command.
 *
 * All rendering/assembly logic lives in buildHtml.ts (no `vscode` import, shared with the
 * standalone CLI preview). This file is only the vscode-facing shell: find the active
 * document, resolve the user's theme/toc settings, prompt for a save location, write the
 * file, and report success/failure via the usual vscode UI.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { buildHtml, MissingArtifactError } from './buildHtml'
import { resolveTheme, resolveToc } from '../markdownItPlugin'

export async function exportToHtml(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Resolve active markdown document ──────────────────────────────────────
  // Fast path: a markdown text editor has focus.
  // Fallback: the preview panel is focused but the source editor is still visible.
  let document: vscode.TextDocument | undefined
  const activeEditor = vscode.window.activeTextEditor
  if (activeEditor?.document.languageId === 'markdown') {
    document = activeEditor.document
  } else {
    const visible = vscode.window.visibleTextEditors.filter(
      e => e.document.languageId === 'markdown',
    )
    if (visible.length === 1) {
      document = visible[0].document
    } else if (visible.length > 1) {
      vscode.window.showErrorMessage(
        'Blueprint Markdown: Multiple Markdown files are open. Focus the one you want to export.',
      )
      return
    } else {
      vscode.window.showErrorMessage(
        'Blueprint Markdown: No Markdown file is open. Open a .md file first.',
      )
      return
    }
  }

  // ── 2. Build the HTML artifact ────────────────────────────────────────────────
  const title = path.basename(document.fileName, path.extname(document.fileName))
  let html: string
  try {
    html = buildHtml({
      source: document.getText(),
      theme: resolveTheme(),
      toc: resolveToc(),
      distDir: path.join(context.extensionPath, 'dist'),
      title,
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath),
    })
  } catch (e) {
    vscode.window.showErrorMessage(
      e instanceof MissingArtifactError ? `Blueprint Markdown: ${e.message}` : `Blueprint Markdown: export failed — ${e}`,
    )
    return
  }

  // ── 3. Prompt for save location ───────────────────────────────────────────────
  const defaultUri = vscode.Uri.file(
    path.join(path.dirname(document.fileName), title + '.html'),
  )
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'HTML file': ['html'] },
    title: 'Export Blueprint Markdown to HTML',
  })
  if (!saveUri) return   // user cancelled

  // ── 4. Write file ─────────────────────────────────────────────────────────────
  await vscode.workspace.fs.writeFile(saveUri, Buffer.from(html, 'utf8'))

  // ── 5. Notify ─────────────────────────────────────────────────────────────────
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
