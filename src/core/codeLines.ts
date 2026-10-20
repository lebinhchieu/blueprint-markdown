/**
 * codeLines.ts — helpers shared by the fence and diff renderers.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Split highlight.js output into one balanced HTML string per source line. hljs wraps
 * multi-line tokens (parameter lists, template literals, block comments) in a single
 * span; splitting on '\n' alone leaves that span open and the browser nests the
 * following lines inside it, which breaks per-line spans, counters and markers.
 * Here each line closes the spans still open and the next line reopens them.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = []
  const open: string[] = []
  let current = ''
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length))
      current = open.join('')
    } else if (part.startsWith('</span')) {
      open.pop()
      current += part
    } else {
      if (part.startsWith('<span')) open.push(part)
      current += part
    }
  }
  lines.push(current)
  return lines
}
