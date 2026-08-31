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
 * A ref that resolves to neither is handed to VS Code's own file search instead
 * (Quick Open, prefilled) — see FIND_URI below. The extension-shaped regex is
 * what filters out false positives like `Node.js`, `v2.0`, `e.g`, etc.
 *
 * Usage: call installInlineCodeRenderer(md) after creating the markdown-it instance.
 * The `vscode`-specific piece is just *where the list of workspace folders comes from* —
 * everything else here (regex matching, fs.statSync, path math) is plain Node. Callers
 * outside the extension host (the CLI, tests) simply omit `getWorkspaceFolders`, which
 * limits resolution to doc-relative paths — no `vscode` import needed at all.
 */

import * as fs from 'fs'
import * as path from 'path'
import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { hexSwatchHtml } from './colors'

/** Structurally compatible with `vscode.Uri` — deliberately not importing `vscode` for this. */
interface DocRef {
  scheme: string
  fsPath: string
}

// name.ext with optional :line or :line-range, no spaces.
// Extension must start with a letter (filters v2.0, etc.) and be ≤8 chars.
// Allows paths with slashes (src/a/b.tsx) and dotfiles (.eslintrc.js).
const FILE_REF = /^([\w.\-/]+\.[A-Za-z][A-Za-z0-9]{0,7})(?::(\d+)(?:-\d+)?)?$/

/**
 * Where an unresolved ref points, handled by the URI handler in extension.ts (which runs
 * `workbench.action.quickOpen` — VS Code's built-in fuzzy file search, and it understands the
 * `name:line` suffix as a line target, so the whole ref is passed through verbatim).
 *
 * Must be a `vscode:` URI, not a `command:` one: the built-in preview's click handler passes
 * `http/https/mailto/vscode/vscode-insiders` hrefs through to VS Code's opener and posts
 * scheme-less ones back to the extension host as `openLink`, but *drops everything else* —
 * `command:` links never fire (see also the header comment in commentInsert.ts). The authority
 * must stay in sync with publisher+name in package.json.
 */
const FIND_URI = 'vscode://ChieuLe.blueprint-markdown-chieu/find?q='

/**
 * Tries to find filePath on disk by checking the doc's own folder, then each
 * workspace folder.  Returns a forward-slash href relative to the doc folder
 * (which VS Code's preview resolves reliably), or undefined when not found.
 */
function resolveHref(filePath: string, docUri: DocRef | undefined, workspaceFolders: string[]): string | undefined {
  if (!docUri || docUri.scheme !== 'file') return undefined

  const isFile = (p: string): boolean => {
    try { return fs.statSync(p).isFile() } catch { return false }
  }

  const docDir = path.dirname(docUri.fsPath)
  const bases = [docDir, ...workspaceFolders]

  for (const base of bases) {
    const abs = path.resolve(base, filePath)
    if (isFile(abs)) {
      const rel = path.relative(docDir, abs)
      // Guard: cross-drive on Windows produces an absolute path VS Code can't open as a link.
      if (!rel || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return undefined
      return rel.split(path.sep).join('/')   // normalise to forward slashes
    }
  }

  return undefined
}

export function installInlineCodeRenderer(
  md: MarkdownIt,
  opts: { getWorkspaceFolders?: () => string[] } = {},
): void {
  md.renderer.rules['code_inline'] = (
    tokens: Token[],
    idx: number,
    _options: unknown,
    env: { currentDocument?: DocRef },
  ): string => {
    const content = tokens[idx].content.trim()
    const esc = md.utils.escapeHtml(content)

    if (/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(content)) {
      return `${hexSwatchHtml(content)}<code>${esc}</code>`
    }

    const match = content.match(FILE_REF)
    if (match) {
      const filePath = match[1]
      const lineNum  = match[2]
      const href = resolveHref(filePath, env?.currentDocument, opts.getWorkspaceFolders?.() ?? [])
      if (href) {
        // Resolved — emit a clickable link VS Code will open.
        const escapedHref = md.utils.escapeHtml(href)
        const full = lineNum ? `${escapedHref}#L${lineNum}` : escapedHref
        return `<a class="file-ref" href="${full}" title="Click to open ${esc}"><code>${esc}</code></a>`
      }
      // Unresolved — hand the ref to VS Code's file search rather than guessing a path.
      if (env?.currentDocument) {
        return `<a class="file-ref" href="${FIND_URI}${encodeURIComponent(content)}" title="Search workspace for ${esc}"><code>${esc}</code></a>`
      }
      // No document in env means exported HTML (exportHtml.ts renders with no env) — there is no
      // VS Code to search, so fall back to copy-on-click. The click handler is in hydrate.ts;
      // components.css shows the "Copied!" pill.
      return `<code class="file-ref" data-copy="${esc}" title="Click to copy">${esc}</code>`
    }
    return `<code>${esc}</code>`
  }
}
