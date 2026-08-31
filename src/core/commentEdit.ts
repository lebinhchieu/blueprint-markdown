/**
 * commentEdit.ts — locates where a `:comment[...]`/`:ai[...]` directive belongs in raw
 * source text, given the click context commentInsert.ts computed in the browser. No
 * `vscode` import: this is the matching engine shared by the VS Code extension
 * (src/extension.ts's addComment/editComment, which apply the result via WorkspaceEdit)
 * and the standalone CLI preview (which splices the file directly).
 *
 * The search is whitespace-flexible because a rendered selection collapses a soft-wrapped
 * source line break to a single space, and rendered text hides markdown syntax entirely
 * (emphasis markers, link brackets). `nth` disambiguates when the phrase repeats nearby —
 * see commentInsert.ts's "Selected/anchor text can repeat" comment for why that exists.
 */

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Between two rendered words, the source can hold markdown syntax that renders as nothing
// at all — not just whitespace. "the **Department**" renders as "the Department" with
// emphasis markers sitting right where a plain \s+ join expects only a literal space; a link
// like "click [here](url) now" hides brackets and a whole (url) segment the same way. Matches
// zero or more of: whitespace, a single emphasis/strikethrough/code/bracket marker, or an
// entire (…) run (a link's target) — so the word-to-word join tolerates any mix of these
// instead of requiring literal whitespace only.
export const INLINE_SYNTAX_GAP = String.raw`(?:\s|[*_~\x60\[\]]|\([^)]*\))*`

/**
 * Runs `pattern` (global) forward from `fromOffset`, taking the `nth` match found before
 * `windowEnd`. Falls back to the last match found if the source has fewer matches than the
 * render implied (rare — e.g. an occurrence hidden in markdown syntax that doesn't render as
 * visible text) instead of erroring.
 */
export function findNthMatch(
  text: string,
  pattern: RegExp,
  fromOffset: number,
  windowEnd: number,
  nth: number,
): RegExpExecArray | null {
  pattern.lastIndex = fromOffset
  let match: RegExpExecArray | null = null
  for (let i = 0; i <= nth; i++) {
    const next = pattern.exec(text)
    if (!next || next.index > windowEnd) break
    match = next
  }
  return match
}

/** ponytail: rendered length is a proxy for the source span's length, padded generously for
 *  markdown syntax overhead (**bold**, links, etc). Upgrade to an exact next-data-line bound
 *  if this padding heuristic misfires in practice. */
export const searchWindowEnd = (fromOffset: number, blockLength?: number): number =>
  fromOffset + Math.max((blockLength ?? 0) * 4, 200)

/** Offset of the start of `line` (0-based) within `text` — equivalent to VS Code's
 *  `document.offsetAt(new Position(line, 0))` for LF/CRLF text alike (a CRLF line's extra
 *  `\r` is just part of that line's content either way, so the arithmetic still lines up). */
export function lineStartOffset(text: string, line: number): number {
  let offset = 0
  for (let i = 0; i < line; i++) {
    const idx = text.indexOf('\n', offset)
    if (idx === -1) return text.length
    offset = idx + 1
  }
  return offset
}

/** Clamp a possibly-stale line number into `text`'s actual range. */
export function clampLine(text: string, line: number): number {
  const lineCount = text.split('\n').length
  return Math.min(Math.max(line, 0), lineCount - 1)
}

export interface InsertArg {
  selectedText: string
  inlineCode?: boolean
  nth?: number
  blockLength?: number
}

/**
 * Where to insert a new `:comment[note]`/`:ai[note]` after `arg.selectedText` — the offset
 * to insert at, or null if the text couldn't be relocated in `text`.
 */
export function findInsertOffset(text: string, line: number, arg: InsertArg): number | null {
  const fromOffset = lineStartOffset(text, clampLine(text, line))
  const words = arg.selectedText.trim().split(/\s+/).map(escapeRegExp)
  const windowEnd = searchWindowEnd(fromOffset, arg.blockLength)

  const findWithGap = (gap: string) => {
    const body = words.join(gap)
    const pattern = arg.inlineCode ? '`' + body + '`' : body
    return findNthMatch(text, new RegExp(pattern, 'g'), fromOffset, windowEnd, arg.nth ?? 0)
  }

  // First try the curated gap (handles the common markdown constructs above); if that still
  // doesn't find it — some other syntax not anticipated there, e.g. a footnote reference or
  // HTML entity sitting between two words — fall back to an unrestricted (but still
  // window-bounded, so still scoped to roughly this block) gap rather than giving up.
  const match = findWithGap(INLINE_SYNTAX_GAP) ?? (words.length > 1 ? findWithGap('[\\s\\S]*?') : null)
  return match ? match.index + match[0].length : null
}

export interface ReplaceArg {
  rawSource: string
  nth?: number
  blockLength?: number
}

export interface ReplaceTarget {
  start: number
  end: number
  directiveName: 'comment' | 'ai'
  currentNote: string
  attrsPart: string
}

/**
 * Where an existing `:comment[...]`/`:ai[...]` directive (given verbatim as `arg.rawSource`,
 * read off the `data-em-source` marker) sits in `text` — the byte range to replace, plus the
 * parsed pieces needed to rebuild it with a new note. Null if `rawSource` doesn't parse as a
 * comment directive, or couldn't be relocated.
 */
export function findReplaceRange(text: string, line: number, arg: ReplaceArg): ReplaceTarget | null {
  const parsed = arg.rawSource.match(/^:(comment|ai)\[([\s\S]*)\](\{[\s\S]*\})?$/)
  if (!parsed) return null // rawSource always comes from a rendered :comment/:ai directive
  const [, directiveName, currentNote, attrsPart = ''] = parsed

  const fromOffset = lineStartOffset(text, clampLine(text, line))
  const re = new RegExp(escapeRegExp(arg.rawSource), 'g')
  const windowEnd = searchWindowEnd(fromOffset, arg.blockLength)
  const match = findNthMatch(text, re, fromOffset, windowEnd, arg.nth ?? 0)
  if (!match) return null

  return {
    start: match.index,
    end: match.index + match[0].length,
    directiveName: directiveName as 'comment' | 'ai',
    currentNote,
    attrsPart,
  }
}
