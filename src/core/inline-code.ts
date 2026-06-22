/**
 * inline-code.ts — Custom code_inline renderer for enhanced-markdown.
 *
 * Overrides markdown-it's default code_inline rule to detect file references
 * such as `foo.ts:73`, `helper.ts:44-46`, or bare `helper.ts` and emit a
 * clickable anchor that opens the file in VS Code when clicked.
 *
 * VS Code's preview intercepts clicks on relative href links and opens them
 * in the editor.  A `#L<line>` fragment navigates to the specific line.
 *
 * Usage: call installInlineCodeRenderer(md) after creating the markdown-it instance.
 */

import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

// name.ext with optional :line or :line-range, no spaces.
// Allows paths with slashes (src/a/b.tsx) and dotfiles (.eslintrc.js).
// "No spaces" is the key guard that keeps plain prose code out.
const FILE_REF = /^([\w.\-/]+\.[A-Za-z0-9]+)(?::(\d+)(?:-\d+)?)?$/

export function installInlineCodeRenderer(md: MarkdownIt): void {
  md.renderer.rules['code_inline'] = (tokens: Token[], idx: number): string => {
    const content = tokens[idx].content.trim()
    const esc = md.utils.escapeHtml(content)
    const match = content.match(FILE_REF)
    if (match) {
      const filePath = match[1]
      const lineNum  = match[2]
      // href: relative path — VS Code resolves it relative to the previewed file.
      // #L<line> navigates to the line in the editor.
      const href = lineNum
        ? `${md.utils.escapeHtml(filePath)}#L${lineNum}`
        : md.utils.escapeHtml(filePath)
      return `<a class="file-ref" href="${href}" title="Click to open ${esc}"><code>${esc}</code></a>`
    }
    return `<code>${esc}</code>`
  }
}
