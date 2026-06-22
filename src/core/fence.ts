/**
 * fence.ts — Custom fence renderer for enhanced-markdown.
 *
 * Overrides markdown-it's default fence rule to handle:
 *   1. Line highlighting:  ```js {1,3-5}  → .hl class on specified line spans
 *   2. Title bar:          ```js title="app.js"  → filename header above the block
 *   3. Mermaid diagrams:   ```mermaid  → <div class="mermaid"> (no highlight)
 *
 * Meta syntax: the info string after the language identifier may contain:
 *   - A highlight range like `{1}`, `{1,3-5}`, `{2-4}`  (curly braces)
 *   - A title like `title="filename"` or `title='filename'`
 *   These can appear in any order after the language name.
 *
 * Usage: call installFenceRenderer(md) after creating the markdown-it instance.
 */

import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js'

// ─── Info string parsing ──────────────────────────────────────────────────

interface FenceMeta {
  lang: string
  title: string | undefined
  /** Set of 1-based line numbers to highlight */
  highlightLines: Set<number>
}

function parseHighlightRanges(raw: string): Set<number> {
  const lines = new Set<number>()
  // e.g. "1,3-5,7"
  for (const part of raw.split(',')) {
    const p = part.trim()
    const range = p.match(/^(\d+)-(\d+)$/)
    if (range) {
      const from = parseInt(range[1], 10)
      const to = parseInt(range[2], 10)
      for (let n = from; n <= to; n++) lines.add(n)
    } else {
      const single = parseInt(p, 10)
      if (!isNaN(single)) lines.add(single)
    }
  }
  return lines
}

function parseFenceInfo(info: string): FenceMeta {
  // Info string examples:
  //   "js {1,3-5} title=\"app.js\""
  //   "mermaid"
  //   "sh"
  const raw = info.trim()

  // Extract title="..." or title='...'
  let title: string | undefined
  let rest = raw.replace(/title=["']([^"']*)["']/, (_, t) => {
    title = t
    return ''
  })

  // Extract highlight ranges {…}
  let highlightLines = new Set<number>()
  rest = rest.replace(/\{([^}]+)\}/, (_, ranges) => {
    highlightLines = parseHighlightRanges(ranges)
    return ''
  })

  // The first remaining token is the language
  const lang = rest.trim().split(/\s+/)[0] ?? ''

  return { lang, title, highlightLines }
}

// ─── Code highlighting ────────────────────────────────────────────────────

function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      // fall through to escaping
    }
  }
  return escapeHtml(code)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Line highlight injection ─────────────────────────────────────────────

/** Wrap all lines in spans when highlighting is active; eliminates \n spacing artifacts. */
function wrapHighlightedLines(highlighted: string, hlLines: Set<number>): string {
  if (hlLines.size === 0) return highlighted

  const lines = highlighted.split('\n')
  if (lines.at(-1) === '') lines.pop()

  return lines
    .map((line, idx) => {
      const cls = hlLines.has(idx + 1) ? 'hl' : 'code-line'
      return `<span class="${cls}">${line}</span>`
    })
    .join('')
}

// ─── Public: install on a markdown-it instance ───────────────────────────

export function installFenceRenderer(md: MarkdownIt): void {
  md.renderer.rules['fence'] = (tokens: Token[], idx: number): string => {
    const token = tokens[idx]
    const meta = parseFenceInfo(token.info ?? '')

    // Mermaid: emit raw div for mermaid.js to render post-DOM-insert
    if (meta.lang === 'mermaid') {
      const code = escapeHtml(token.content.trim())
      return `<div class="mermaid">${code}</div>\n`
    }

    // Highlight the code
    const rawHighlighted = highlightCode(token.content, meta.lang)
    const withLineHL = wrapHighlightedLines(rawHighlighted, meta.highlightLines)

    const langClass = meta.lang ? ` class="hljs language-${escapeHtml(meta.lang)}"` : ' class="hljs"'

    const titleBar = meta.title
      ? `<div class="code-title"><span class="material-symbols-outlined" style="font-size:14px">draft</span>${escapeHtml(meta.title)}</div>`
      : ''

    return (
      `<div class="code-block">${titleBar}` +
      `<pre><code${langClass}>${withLineHL}</code></pre></div>\n`
    )
  }
}
