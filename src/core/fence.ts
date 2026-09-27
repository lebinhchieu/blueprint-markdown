/**
 * fence.ts — Custom fence renderer for blueprint-markdown.
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
import { parseLineRanges } from './ranges'
import { hljsDefineVue } from './hljsVueLanguage'

hljs.registerLanguage('vue', hljsDefineVue)

// ─── Info string parsing ──────────────────────────────────────────────────

interface FenceMeta {
  lang: string
  title: string | undefined
  /** Set of 1-based line numbers to highlight */
  highlightLines: Set<number>
  /** Present-mode cue id from a `#id` token */
  cue: string | undefined
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
    highlightLines = parseLineRanges(ranges)
    return ''
  })

  // Extract a present-mode cue: `#id`
  let cue: string | undefined
  rest = rest.replace(/(^|\s)#([\w-]+)/, (_, lead, id) => {
    cue = id
    return lead
  })

  // The first remaining token is the language
  const lang = rest.trim().split(/\s+/)[0] ?? ''

  return { lang, title, highlightLines, cue }
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

/**
 * Wrap each line in an inline span, keeping the newlines, so a cued block looks
 * exactly as it would unwrapped while the presenter can still address its lines.
 */
function wrapCueLines(highlighted: string): string {
  const lines = highlighted.split('\n')
  const trailing = lines.at(-1) === ''
  if (trailing) lines.pop()
  return lines.map(line => `<span class="em-ln">${line}</span>`).join('\n') + (trailing ? '\n' : '')
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
    const withLineHL = meta.highlightLines.size > 0 || !meta.cue
      ? wrapHighlightedLines(rawHighlighted, meta.highlightLines)
      : wrapCueLines(rawHighlighted)

    const langClass = meta.lang ? ` class="hljs language-${escapeHtml(meta.lang)}"` : ' class="hljs"'

    const titleBar = meta.title
      ? `<div class="code-title"><span class="material-symbols-outlined" style="font-size:14px">draft</span>${escapeHtml(meta.title)}</div>`
      : ''

    const cueAttr = meta.cue ? ` data-cue="${escapeHtml(meta.cue)}"` : ''

    return (
      `<div class="code-block"${cueAttr}>${titleBar}` +
      `<pre><code${langClass}>${withLineHL}</code></pre></div>\n`
    )
  }
}
