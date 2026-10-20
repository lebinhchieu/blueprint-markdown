/**
 * fence.ts — Custom fence renderer for blueprint-markdown.
 *
 * Overrides markdown-it's default fence rule to handle:
 *   1. Line highlighting:  ```js {1,3-5}  → .hl class on specified line spans
 *   2. Title bar:          ```js title="app.js"  → filename header above the block
 *   3. Mermaid diagrams:   ```mermaid  → <div class="mermaid"> (no highlight)
 *   4. Line numbers:       ```js start=40  → gutter numbered from 40 (highlight/marks stay 1-based)
 *   5. Numbered markers:   ```js marks="3:1 7:2"  → badge ① on line 3, ② on line 7 (see markers.ts)
 *   6. Diffs:              ```diff lang=ts  → tinted +/- rows, old/new gutter (see diff.ts)
 *
 * Meta syntax: the info string after the language identifier may contain:
 *   - A highlight range like `{1}`, `{1,3-5}`, `{2-4}`  (curly braces)
 *   - A title like `title="filename"` or `title='filename'`
 *   - `start=N` (first gutter line number) and `marks="line:n …"` (line → marker number)
 *   These can appear in any order after the language name.
 *
 * Usage: call installFenceRenderer(md) after creating the markdown-it instance.
 */

import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js'
import { parseLineRanges } from './ranges'
import { hljsDefineVue } from './hljsVueLanguage'
import { escapeHtml, splitHighlightedLines } from './codeLines'
import { renderDiff } from './diff'

hljs.registerLanguage('vue', hljsDefineVue)

// ─── Info string parsing ──────────────────────────────────────────────────

interface FenceMeta {
  lang: string
  title: string | undefined
  /** Set of 1-based line numbers to highlight */
  highlightLines: Set<number>
  /** Present-mode cue id from a `#id` token */
  cue: string | undefined
  /** Gutter number of the first line; undefined = no gutter */
  start: number | undefined
  /** 1-based line → marker number (digits), linked to a :::marker note */
  marks: Map<number, string>
  /** `lang=ts` on a ```diff fence: language to highlight the code under the +/- signs */
  diffLang: string | undefined
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

  // Extract lang=xx (diff fences only use it, but it is always stripped from the language)
  let diffLang: string | undefined
  rest = rest.replace(/(^|\s)lang=([\w+#-]+)/, (_, lead, l) => {
    diffLang = l
    return lead
  })

  // Extract start=N
  let start: number | undefined
  rest = rest.replace(/(^|\s)start=(\d+)(?=\s|$)/, (_, lead, n) => {
    start = parseInt(n, 10)
    return lead
  })

  // Extract marks="3:1 7:2"
  const marks = new Map<number, string>()
  rest = rest.replace(/(^|\s)marks=["']([^"']*)["']/, (_, lead, spec) => {
    for (const pair of spec.split(/\s+/)) {
      const m = pair.match(/^(\d+):(\d+)$/)
      if (m) marks.set(parseInt(m[1], 10), m[2])
    }
    return lead
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

  return { lang, title, highlightLines, cue, start, marks, diffLang }
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


// ─── Line highlight injection ─────────────────────────────────────────────

/** Wrap all lines in spans when highlighting is active; eliminates \n spacing artifacts. */
function wrapHighlightedLines(
  highlighted: string,
  hlLines: Set<number>,
  marks: Map<number, string>,
  numbered: boolean,
): string {
  if (hlLines.size === 0 && marks.size === 0 && !numbered) return highlighted

  const lines = splitHighlightedLines(highlighted)
  // A trailing newline leaves an empty last entry (or one holding only reopened spans).
  if (lines.at(-1)!.replace(/<\/?span[^>]*>/g, '') === '') lines.pop()

  return lines
    .map((line, idx) => {
      const n = idx + 1
      const mk = marks.get(n)
      // Not `code-line`: VS Code's scroll sync collects every .code-line and reads data-line
      // (null → 0), so a bare line span corrupts the sync order and the preview jumps to the top.
      const cls = (hlLines.has(n) ? 'hl' : 'ln-row') + (mk ? ' mk' : '')
      const mkAttr = mk ? ` data-mk="${mk}"` : ''
      return `<span class="${cls}"${mkAttr}>${line}</span>`
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
      const cue = meta.cue ? ` data-cue="${escapeHtml(meta.cue)}"` : ''
      return `<div class="mermaid"${cue}>${code}</div>\n`
    }

    // Diff: its own row renderer; titles, cues, {hl} and marks still apply
    if (meta.lang === 'diff') {
      const diff = renderDiff(token.content, { lang: meta.diffLang, hl: meta.highlightLines, marks: meta.marks })
      const diffTitle = meta.title
        ? `<div class="code-title"><span class="material-symbols-outlined" style="font-size:14px">difference</span>${escapeHtml(meta.title)}</div>`
        : ''
      const diffCue = meta.cue ? ` data-cue="${escapeHtml(meta.cue)}"` : ''
      const gutter = diff.numbered ? ` data-dn style="--dn-digits:${diff.digits}"` : ''
      return (
        `<div class="code-block code-block--diff"${diffCue}${gutter}>${diffTitle}` +
        `<pre><code class="hljs language-diff">${diff.html}</code></pre></div>\n`
      )
    }

    // Highlight the code
    const rawHighlighted = highlightCode(token.content, meta.lang)
    const numbered = meta.start !== undefined
    const needsBlockLines = meta.highlightLines.size > 0 || meta.marks.size > 0 || numbered
    const withLineHL = needsBlockLines || !meta.cue
      ? wrapHighlightedLines(rawHighlighted, meta.highlightLines, meta.marks, numbered)
      : wrapCueLines(rawHighlighted)

    const langClass = meta.lang ? ` class="hljs language-${escapeHtml(meta.lang)}"` : ' class="hljs"'

    const titleBar = meta.title
      ? `<div class="code-title"><span class="material-symbols-outlined" style="font-size:14px">draft</span>${escapeHtml(meta.title)}</div>`
      : ''

    const cueAttr = meta.cue ? ` data-cue="${escapeHtml(meta.cue)}"` : ''

    // Gutter: --ln-base seeds the line counter, --ln-digits sizes the number column.
    let gutterAttr = ''
    if (numbered) {
      const lineCount = Math.max(1, token.content.replace(/\n$/, '').split('\n').length)
      const digits = String(meta.start! + lineCount - 1).length
      gutterAttr = ` data-numbered style="--ln-base:${meta.start! - 1};--ln-digits:${digits}"`
    }

    return (
      `<div class="code-block"${cueAttr}${gutterAttr}>${titleBar}` +
      `<pre><code${langClass}>${withLineHL}</code></pre></div>\n`
    )
  }
}
