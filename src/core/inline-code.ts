/**
 * inline-code.ts — Custom code_inline renderer for blueprint-markdown.
 *
 * Overrides markdown-it's default code_inline rule to detect file references
 * such as `foo.ts:73`, `helper.ts:44-46`, or bare `src/helper.ts` and emit a
 * clickable anchor that opens the file in VS Code when clicked.
 *
 * Resolution strategy (mirrors VS Code's own link resolver):
 *   1. Doc-relative:  <dirname of .md>/<path> — emit path as-is (VS Code default).
 *   2. Root-relative: <workspaceFolder>/<path> — emit /path (leading slash).
 * Only linkifies when the file actually exists on disk, which also filters out
 * false positives like `Node.js`, `v2.0`, `e.g`, etc.
 *
 * Usage: call installInlineCodeRenderer(md) after creating the markdown-it instance.
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

// name.ext with optional :line or :line-range, no spaces.
// Extension must start with a letter (filters v2.0, etc.) and be ≤8 chars.
// Allows paths with slashes (src/a/b.tsx) and dotfiles (.eslintrc.js).
const FILE_REF = /^([\w.\-/]+\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+)(?:-\d+)?)?$/

/** Returns the href string VS Code should open, or undefined if not a real file. */
function resolveHref(filePath: string, docUri: vscode.Uri | undefined): string | undefined {
  if (!docUri || docUri.scheme !== 'file') return undefined

  const isFile = (p: string): boolean => {
    try { return fs.statSync(p).isFile() } catch { return false }
  }

  // 1) Doc-relative — emit path as-is (VS Code resolves from the .md file's folder).
  if (isFile(path.resolve(path.dirname(docUri.fsPath), filePath))) return filePath

  // 2) Workspace-root-relative — emit /path so VS Code resolves from the root.
  const folder = vscode.workspace.getWorkspaceFolder(docUri)
  if (folder && isFile(path.join(folder.uri.fsPath, filePath))) {
    return '/' + filePath.replace(/^\/+/, '')
  }

  return undefined
}

export function installInlineCodeRenderer(md: MarkdownIt): void {
  md.renderer.rules['code_inline'] = (
    tokens: Token[],
    idx: number,
    _options: unknown,
    env: { currentDocument?: vscode.Uri },
  ): string => {
    const content = tokens[idx].content.trim()
    const esc = md.utils.escapeHtml(content)
    const match = content.match(FILE_REF)
    if (match) {
      const filePath = match[1]
      const lineNum  = match[2]
      const href = resolveHref(filePath, env?.currentDocument)
      if (href) {
        const escapedHref = md.utils.escapeHtml(href)
        const full = lineNum ? `${escapedHref}#L${lineNum}` : escapedHref
        return `<a class="file-ref" href="${full}" title="Click to open ${esc}"><code>${esc}</code></a>`
      }
    }
    return `<code>${esc}</code>`
  }
}
