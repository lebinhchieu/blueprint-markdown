/**
 * installBlueprintMarkdown.ts — the blueprint-markdown directive grammar, installed onto
 * any markdown-it instance. Zero `vscode` dependency — this is what makes it reusable by
 * both the VS Code extension (via src/markdownItPlugin.ts's thin wrapper) and the standalone
 * CLI preview (src/export/buildHtml.ts), with one engine so the two can't drift apart.
 *
 * Three things are installed:
 *   1. A block rule ('em_directive') that detects :::name / ::name spans,
 *      captures the raw text, and sets token.map for scroll sync.
 *   2. The existing inline directive rule (:name[text]{attrs}).
 *   3. The existing custom fence renderer (line-highlight / title bar / mermaid div).
 *
 * Block rendering is delegated entirely to the existing core engine:
 *   parseBlocks(rawText) → createRenderTree(privateMd, …)(ast) → html
 *
 * A *private* markdown-it instance (privateMd) is used for rendering
 * the text runs inside directives to avoid infinite recursion when
 * the outer md (which now has our block rule) would re-trigger it.
 */

import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import markdownItMark from 'markdown-it-mark'
import markdownItTaskLists from 'markdown-it-task-lists'
import { parseBlocks } from './parser'
import { parseAttrs } from './attrs'
import { buildRegistry } from './directives/index'
import { createMarkdownIt } from './markdownit'
import { installInlineRule, installHexColorRule } from './inline'
import { installFenceRenderer } from './fence'
import { installInlineCodeRenderer } from './inline-code'
import { createRenderTree } from './renderer'

// ─── Block directive regexes (mirror parser.ts) ───────────────────────────────

const RE_CLOSE = /^\s*:::\s*$/
const RE_OPEN  = /^\s*:::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/
const RE_LEAF  = /^\s*::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read the raw source text of a line from the block state. */
function getLine(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line], state.eMarks[line])
}

/**
 * Starting from the :::name opening line (startLine), find the index of
 * the matching closing ::: line, respecting nested containers and fenced
 * code block opacity (so ``` regions are treated as TEXT).
 *
 * Returns the index of the close line, or state.lineMax if unclosed.
 */
function findBlockEnd(state: StateBlock, startLine: number): number {
  let depth = 1          // we are already inside the opening line
  let inFence = false
  let fenceChar = ''
  let fenceLen  = 0

  for (let i = startLine + 1; i <= state.lineMax; i++) {
    const line = getLine(state, i)

    // Fence state machine — mirrors parser.ts:matchFence
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)/)
    if (!inFence && fenceMatch) {
      inFence   = true
      fenceChar = fenceMatch[2][0]
      fenceLen  = fenceMatch[2].length
      continue
    }
    if (inFence) {
      const closeMatch = line.match(/^(\s*)(```+|~~~+)/)
      if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= fenceLen) {
        inFence = false
      }
      continue
    }

    if (RE_OPEN.test(line)) {
      depth++
    } else if (RE_CLOSE.test(line)) {
      depth--
      if (depth === 0) return i
    }
  }

  return state.lineMax  // unclosed container — return last available line
}

// ─── Public installer ─────────────────────────────────────────────────────────

export interface InstallOptions {
  /** Called fresh on every render — same pattern the VS Code wrapper relies on so a
   *  workspace-setting change picks up on the next `markdown.preview.refresh` without
   *  needing to recreate the markdown-it instance. */
  getTheme: () => string
  getToc: () => string
  /** Omit to disable workspace-relative file-ref resolution (doc-relative still works via
   *  `env.currentDocument`, which the CLI/export paths never populate anyway). */
  getWorkspaceFolders?: () => string[]
  /** VS Code's own preview host stamps `data-line`/`code-line` onto every native block
   *  element itself (paragraphs, list items, headings, …) as part of its built-in scroll-sync
   *  machinery — `em_directive`'s renderer only has to replicate that for our own custom token
   *  type, since VS Code's auto-wrapping doesn't know about it. Outside VS Code there's no such
   *  host, so ordinary prose never gets a `data-line` at all unless this flag is set — which
   *  matters for the CLI preview's comment feature: `commentInsert.ts`'s `.closest('[data-line]')`
   *  lookup needs *some* line-bearing ancestor to find the click's source line, for text that
   *  isn't inside a directive. Leave unset for VS Code (redundant, the host already does this)
   *  and for exports (nothing there is ever clicked to comment on). */
  stampLineNumbers?: boolean
}

export function installBlueprintMarkdownCore(md: MarkdownIt, opts: InstallOptions): MarkdownIt {
  // Build the directive registry (same set as the web viewer).
  const registry = buildRegistry()

  // Private markdown-it instance for rendering text runs INSIDE directives.
  // Using the outer md here would re-trigger our block rule → infinite recursion.
  // The renderText hook in createRenderTree was designed exactly for this case.
  const privateMd = createMarkdownIt()
  installInlineRule(privateMd, registry)
  installHexColorRule(privateMd)

  // renderTree: walks the AST produced by parseBlocks and returns an HTML string.
  const renderTree = createRenderTree(
    privateMd,
    registry,
    undefined,
    (src) => privateMd.render(src),  // renderText → private md only, never outer
  )

  // ── Install on the outer md ──

  // Inline directives (:chip[Active]{primary}, :icon{home}, etc.)
  installInlineRule(md, registry)
  installHexColorRule(md)

  // Custom fence renderer: line highlighting, title bars, mermaid div.
  // Supersedes markdown-it's built-in fence highlighting; we call hljs ourselves.
  installFenceRenderer(md)

  // Custom inline-code renderer: file refs as clickable links.
  installInlineCodeRenderer(md, { getWorkspaceFolders: opts.getWorkspaceFolders })

  // ==highlight== and - [ ] / - [x] — must be on the outer md, not just privateMd.
  md.use(markdownItMark)
  md.use(markdownItTaskLists, { label: true })

  // ── Block rule ──

  function emDirectiveRule(
    state: StateBlock,
    startLine: number,
    _endLine: number,
    silent: boolean,
  ): boolean {
    const firstLine = getLine(state, startLine)

    const isContainer = RE_OPEN.test(firstLine)
    const isLeaf      = !isContainer && RE_LEAF.test(firstLine)
    if (!isContainer && !isLeaf) return false

    // silent=true: validation probe by paragraph-interruption check.
    // Confirm the match but do NOT push tokens.
    if (silent) return true

    let endLine: number
    const rawLines: string[] = []

    if (isLeaf) {
      // Single-line leaf — no closing ::: needed
      endLine = startLine
      rawLines.push(firstLine)
    } else {
      // Container — scan for the matching :::
      endLine = findBlockEnd(state, startLine)
      for (let i = startLine; i <= endLine; i++) {
        rawLines.push(getLine(state, i))
      }
    }

    // Emit a single block token.
    // token.map = [startLine, endLine + 1] tells the sourceMap rule to stamp
    // data-line / code-line on the rendered element → scroll sync.
    const token    = state.push('em_directive', '', 0)
    token.map      = [startLine, endLine + 1]
    token.content  = rawLines.join('\n')
    token.block    = true

    state.line = endLine + 1
    return true
  }

  // Register before 'fence' so directive-looking content near fences is
  // handled first.  The alt array lets directives interrupt paragraphs.
  md.block.ruler.before('fence', 'em_directive', emDirectiveRule, {
    alt: ['paragraph', 'blockquote', 'list'],
  })

  // Token renderer: delegate to the existing core engine.
  //
  // Wraps the output in a bare div carrying data-line/code-line — the same
  // attribute/class convention native block types (paragraph_open, heading_open,
  // fence, …) get stamped with to drive scroll sync. Custom token types like
  // em_directive are never auto-wrapped by markdown-it, and token.map alone (set
  // above) is otherwise never read — without this, every directive is a
  // scroll-sync dead zone.
  md.renderer.rules['em_directive'] = (tokens: Token[], idx: number): string => {
    const token = tokens[idx]
    const ast = parseBlocks(token.content)
    let html = renderTree(ast)
    // Stamp id/data-em-toc-id onto directive-internal headings the em_toc rule
    // found ahead of time (see tocHeadings below) — this html is otherwise the
    // only place those headings exist as real tags.
    const tocHeadings = (token.meta as { tocHeadings?: TocHeadingStamp[] } | null)?.tocHeadings
    if (tocHeadings?.length) html = stampTocHeadings(html, tocHeadings)
    return token.map
      ? `<div class="code-line" data-line="${token.map[0]}">${html}</div>\n`
      : html
  }

  // ── Theme marker ──
  //
  // A core rule that prepends a hidden <div data-em-theme="light|dark"> to the
  // rendered output. previewRuntime.ts reads this value and stamps it on <body> so
  // em-theme.css/hljs.css can key off `body[data-em-theme="dark"]`.
  //
  // Calls opts.getTheme() fresh on every render so config changes are picked up
  // immediately after the caller's own refresh mechanism fires.
  md.core.ruler.push('em_theme_marker', (state: StateCore) => {
    // Skip nested renderInline() calls — inlineMode=true there — so the <div>
    // is never injected inside button/tooltip/chip anchor text.
    if (state.inlineMode) return false
    const theme = opts.getTheme()
    const token = new state.Token('html_block', '', 0)
    token.content = `<div class="em-theme-config" data-em-theme="${theme}" hidden></div>\n`
    state.tokens.unshift(token)
    return false   // non-terminating; let other core rules run
  })

  // ── Table of Contents rail ──
  //
  // A core rule that:
  //   1. Assigns slug ids to every included heading_open token so they become
  //      scroll targets (works with JS disabled too, via real #id anchors).
  //   2. Prepends a <nav class="em-toc"> with one level-bar item per heading so
  //      the reading rail is present in the rendered HTML for both the live
  //      preview and exported HTML artifacts.
  //
  // Depth is governed by opts.getToc() ('off' | 'h2' | 'h3').
  // Skips docs with fewer than 2 headings — no rail needed for trivial pages.
  md.core.ruler.push('em_toc', (state: StateCore) => {
    if (state.inlineMode) return false

    const tocSetting = opts.getToc()
    if (tocSetting === 'off') return false
    const HEADING_TAGS = new Set(tocSetting === 'h2' ? ['h1', 'h2'] : ['h1', 'h2', 'h3'])

    // ── Pass 1: collect headings, assign ids ──
    type HeadingEntry = { level: number; id: string; text: string }
    const entries: HeadingEntry[] = []
    const slugCount = new Map<string, number>()

    for (let i = 0; i < state.tokens.length; i++) {
      const tok = state.tokens[i]

      // Directive-internal headings (e.g. ### Auth Service {#auth} inside an
      // :::explorer detail pane) never reach this loop as heading_open tokens —
      // the whole directive body is one opaque em_directive token whose content
      // is only parsed/rendered later, by a private md instance, inside the
      // renderer rule below. Scan the raw content directly so they still make
      // the rail; the assigned ids are handed back via token.meta so the
      // renderer can stamp the same ids onto the actual <h#> tags it produces.
      if (tok.type === 'em_directive') {
        const found = collectDirectiveHeadings(tok.content).filter((h) => HEADING_TAGS.has(`h${h.level}`))
        if (found.length === 0) continue
        const stamps: TocHeadingStamp[] = []
        for (const h of found) {
          // h.text is raw markdown — a plain `#` heading's own text, or a
          // toc= directive's title= (which routinely has a :chip[...]{...}
          // baked in). Parse it inline so the rail label/slug match what a
          // real heading_open/inline pair would produce (plain text only,
          // via inlineText below), not the raw source with directive syntax
          // leaking through.
          const inlineTok = state.md.parseInline(h.text, state.env)[0]
          const cleanText = inlineTok ? inlineText(inlineTok) || h.text : h.text
          const base = h.explicitId ?? slugify(cleanText) ?? `section-${entries.length + 1}`
          const count = (slugCount.get(base) ?? 0) + 1
          slugCount.set(base, count)
          const id = count === 1 ? base : `${base}-${count}`
          stamps.push({ id, idx: entries.length, level: h.level })
          entries.push({ level: h.level, id, text: cleanText })
        }
        tok.meta = { tocHeadings: stamps }
        continue
      }

      if (tok.type !== 'heading_open' || !HEADING_TAGS.has(tok.tag)) continue

      // The inline token immediately follows the heading_open token.
      const inlineTok = state.tokens[i + 1]
      const text = inlineTok?.type === 'inline' ? inlineText(inlineTok) : ''
      const base = slugify(text) || `section-${entries.length + 1}`

      // Deduplicate: first occurrence keeps base slug, duplicates get -2, -3 …
      const count = (slugCount.get(base) ?? 0) + 1
      slugCount.set(base, count)
      const id = count === 1 ? base : `${base}-${count}`

      tok.attrSet('id', id)
      // data-em-toc-id: a stable 0-based index owned by this extension.
      // The runtime uses it for navigation instead of the slug, avoiding
      // any mismatch with a host editor's own slugifier.
      tok.attrSet('data-em-toc-id', String(entries.length))
      entries.push({ level: parseInt(tok.tag[1], 10), id, text })
    }

    if (entries.length < 2) return false

    // ── Pass 2: build <nav class="em-toc"> HTML ──
    // Each item: right-aligned label + a level-width bar (h1 widest).
    const items = entries.map((e, idx) =>
      `<li class="em-toc__item em-toc__item--h${e.level}">` +
      `<a href="#${e.id}" data-toc-target="${idx}">` +
      `<span class="em-toc__label">${escapeHtml(e.text)}</span>` +
      `<span class="em-toc__bar"></span>` +
      `</a></li>`,
    ).join('\n')

    // Dense docs: rail hides h3 rows entirely (CSS keys off em-toc--dense).
    const dense = entries.length > 40 ? ' em-toc--dense' : ''
    const nav =
      `<nav class="em-toc${dense}" aria-label="Table of contents">` +
      `<ol class="em-toc__list">\n${items}\n</ol>` +
      `</nav>\n`

    const navToken = new state.Token('html_block', '', 0)
    navToken.content = nav
    // Prepend after the theme marker (index 0) so the nav is before content.
    state.tokens.splice(1, 0, navToken)

    return false
  })

  // ── Line numbers on plain content (CLI comment feature only — see InstallOptions) ──
  //
  // Every block-opening token markdown-it produces (paragraph_open, heading_open,
  // list_item_open, blockquote_open, …) already carries `.map = [startLine, endLine]` —
  // stamp it straight onto the element as `data-line` so commentInsert.ts's
  // `.closest('[data-line]')` has something to find on ordinary prose, not just inside
  // em_directive's own hand-stamped wrapper.
  if (opts.stampLineNumbers) {
    md.core.ruler.push('em_line_numbers', (state: StateCore) => {
      if (state.inlineMode) return false
      for (const tok of state.tokens) {
        if (tok.nesting === 1 && tok.map) {
          tok.attrSet('data-line', String(tok.map[0]))
        }
      }
      return false
    })
  }

  return md
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Plain-text content of an inline token: concatenates text and code spans,
 * skipping formatting delimiters — unlike a regex strip, "Config (v2)" and
 * "a_b_c" survive intact.
 */
function inlineText(tok: Token): string {
  const parts: string[] = []
  for (const child of tok.children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline') parts.push(child.content)
  }
  return parts.join('').trim()
}

/**
 * Convert heading text to a URL-safe slug — GitHub-compatible (matches
 * VS Code's own slugifier: keep letters/numbers/underscores/hyphens,
 * spaces → hyphens, no hyphen collapsing).
 */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/** One directive-internal heading whose id em_toc already assigned, keyed by
 *  the order it will appear in the em_directive token's rendered html. */
type TocHeadingStamp = { id: string; idx: number; level: number }

/** A `{#id}` at the very end of a heading's text — mirrors explorer.ts's
 *  RE_TRAILING_ANCHOR (`### Auth Service {#auth}`), duplicated rather than
 *  imported since this file already mirrors parser.ts's regexes locally. */
const RE_TRAILING_ANCHOR = /^([\s\S]*?)\s*\{#([A-Za-z][\w-]*)\}\s*$/

/** `toc=` attribute value → heading level. Anything else (h4+, garbage) is ignored. */
const TOC_LEVELS: Record<string, number> = { h1: 1, h2: 2, h3: 3 }

/**
 * Scan a directive's raw (unparsed) content for two things that both make the
 * TOC rail: ATX headings (`### Text`), and a directive's own opening line
 * (`:::name{... toc=h2 title="..." ...}`) — the latter is how a `card`/
 * `callout`/`details`/`step` title becomes a real heading (see those
 * directives' renderers). Skips fenced code regions so a code sample showing
 * either syntax never counts. `:::name`/`::name` lines don't interfere with
 * heading detection and vice versa — both are plain per-line regexes, so
 * nested containers need no special handling; a directive's own opening line
 * is just line 0 of its own content, and a nested directive's line is just
 * another line inside its parent's content.
 */
function collectDirectiveHeadings(
  content: string,
): { level: number; text: string; explicitId?: string }[] {
  const results: { level: number; text: string; explicitId?: string }[] = []
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (const line of content.split('\n')) {
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)/)
    if (!inFence && fenceMatch) {
      inFence = true
      fenceChar = fenceMatch[2][0]
      fenceLen = fenceMatch[2].length
      continue
    }
    if (inFence) {
      if (fenceMatch && fenceMatch[2][0] === fenceChar && fenceMatch[2].length >= fenceLen) inFence = false
      continue
    }

    const headingMatch = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const raw = headingMatch[2].trim()
      const anchor = raw.match(RE_TRAILING_ANCHOR)
      results.push(
        anchor
          ? { level, text: anchor[1].trim(), explicitId: anchor[2] }
          : { level, text: raw },
      )
      continue
    }

    const directiveMatch = line.match(RE_OPEN) ?? line.match(RE_LEAF)
    if (!directiveMatch) continue
    const attrs = parseAttrs(directiveMatch[2] ?? '')
    const level = TOC_LEVELS[attrs.named['toc'] ?? '']
    const title = attrs.named['title']
    if (level && title) results.push({ level, text: title })
  }

  return results
}

/**
 * Stamp `id`/`data-em-toc-id` onto the `<h#>` tags produced for a directive's
 * headings, in the order em_toc already assigned them. Matched by level, not
 * position: a tag's own level tells us whether it's one em_toc counted (e.g.
 * h4-h6 are skipped when the toc setting is 'h3') without needing the
 * heading-depth setting here too.
 */
function stampTocHeadings(html: string, stamps: TocHeadingStamp[]): string {
  let next = 0
  return html.replace(/<h([1-6])([^>]*)>/g, (whole, levelStr: string, attrs: string) => {
    if (next >= stamps.length || stamps[next].level !== parseInt(levelStr, 10)) return whole
    const { id, idx } = stamps[next++]
    return `<h${levelStr}${attrs} id="${id}" data-em-toc-id="${idx}">`
  })
}

/** Escape HTML special characters for safe attribute/text insertion. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
