/**
 * diff.ts — unified-diff rendering for ```diff fences.
 *
 *   ```diff lang=ts title="auth.ts"
 *   @@ -10,4 +10,5 @@ function login()
 *      const user = find(id)
 *   -  return token
 *   +  const token = sign(user)
 *   +  return token
 *   ```
 *
 * Paste `git diff` output as-is, or write a bare +/- snippet with no headers. Added and
 * removed lines get a tinted row; with `@@` hunk headers the old/new line numbers show in
 * a two-column gutter. `lang=ts` syntax-highlights the code under the +/- signs.
 * Gutter numbers and signs are generated content, so copying a selection gives plain code.
 */

import hljs from 'highlight.js'
import { escapeHtml, splitHighlightedLines } from './codeLines'

type Kind = 'add' | 'del' | 'ctx' | 'hunk' | 'meta'

interface DiffLine {
  kind: Kind
  text: string
  /** Old/new file line number; undefined where the line doesn't exist on that side */
  oldNo?: number
  newNo?: number
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const FILE_HEADER_RE = /^(diff --git |index |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to) |Binary files )/

function parseDiff(content: string): DiffLine[] {
  const raw = content.replace(/\n$/, '').split('\n')
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  // Lines still owed by the current hunk header; while > 0, '---' / '+++' are code, not headers.
  let oldLeft = 0
  let newLeft = 0

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    const inHunk = oldLeft > 0 || newLeft > 0

    const hunk = line.match(HUNK_RE)
    if (hunk) {
      oldNo = parseInt(hunk[1], 10)
      newNo = parseInt(hunk[3], 10)
      oldLeft = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10)
      newLeft = hunk[4] === undefined ? 1 : parseInt(hunk[4], 10)
      out.push({ kind: 'hunk', text: line })
      continue
    }

    if (!inHunk) {
      const pair = line.startsWith('--- ') && raw[i + 1]?.startsWith('+++ ')
      if (pair) {
        out.push({ kind: 'meta', text: line }, { kind: 'meta', text: raw[i + 1] })
        i++
        continue
      }
      if (FILE_HEADER_RE.test(line) || line.startsWith('\\ ')) {
        out.push({ kind: 'meta', text: line })
        continue
      }
    }
    if (line.startsWith('\\ ')) { // "\ No newline at end of file"
      out.push({ kind: 'meta', text: line })
      continue
    }

    const sign = line[0]
    const body = line.slice(1)
    if (sign === '+') {
      out.push({ kind: 'add', text: body, newNo: inHunk ? newNo : undefined })
      if (inHunk) { newNo++; newLeft-- }
    } else if (sign === '-') {
      out.push({ kind: 'del', text: body, oldNo: inHunk ? oldNo : undefined })
      if (inHunk) { oldNo++; oldLeft-- }
    } else {
      // Context line: one leading space; some tools strip it from blank lines.
      out.push({
        kind: 'ctx',
        text: sign === ' ' ? body : line,
        oldNo: inHunk ? oldNo : undefined,
        newNo: inHunk ? newNo : undefined,
      })
      if (inHunk) { oldNo++; newNo++; oldLeft--; newLeft-- }
    }
  }
  return out
}

/** Syntax-highlight the code of every +/-/context line as one stream, one balanced HTML string per line. */
function highlightBodies(lines: DiffLine[], lang: string | undefined): string[] {
  const code = lines.filter(l => l.kind === 'add' || l.kind === 'del' || l.kind === 'ctx')
  if (lang && hljs.getLanguage(lang)) {
    try {
      const html = hljs.highlight(code.map(l => l.text).join('\n'), { language: lang, ignoreIllegals: true }).value
      return splitHighlightedLines(html)
    } catch {
      // fall through to plain text
    }
  }
  return code.map(l => escapeHtml(l.text))
}

const SIGN: Record<Kind, string> = { add: '+', del: '-', ctx: ' ', hunk: '', meta: '' }

export interface DiffRender {
  /** Inner HTML of the <code> element */
  html: string
  /** Whether any line carries a file line number (hunk headers present) */
  numbered: boolean
  /** Digits needed by the widest line number */
  digits: number
}

export function renderDiff(
  content: string,
  opts: { lang?: string; hl: Set<number>; marks: Map<number, string> },
): DiffRender {
  const lines = parseDiff(content)
  const bodies = highlightBodies(lines, opts.lang)
  const numbered = lines.some(l => l.oldNo !== undefined || l.newNo !== undefined)
  const widest = lines.reduce((m, l) => Math.max(m, l.oldNo ?? 0, l.newNo ?? 0), 0)

  let bodyIdx = 0
  const html = lines.map((l, idx) => {
    const n = idx + 1
    const mk = opts.marks.get(n)
    // ln-row, not code-line: see the note in fence.ts about VS Code's scroll sync.
    const cls = `ln-row dl dl--${l.kind}` + (opts.hl.has(n) ? ' hl' : '') + (mk ? ' mk' : '')
    const mkAttr = mk ? ` data-mk="${mk}"` : ''
    const isCode = l.kind === 'add' || l.kind === 'del' || l.kind === 'ctx'
    const text = isCode ? bodies[bodyIdx++] : escapeHtml(l.text)
    const gutter = numbered
      ? `<span class="dl__o"${l.oldNo !== undefined ? ` data-n="${l.oldNo}"` : ''}></span>` +
        `<span class="dl__n"${l.newNo !== undefined ? ` data-n="${l.newNo}"` : ''}></span>`
      : ''
    return `<span class="${cls}"${mkAttr}>${gutter}<span class="dl__c" data-sign="${SIGN[l.kind]}">${text}</span></span>`
  }).join('')

  return { html, numbered, digits: String(widest).length }
}
