/**
 * markdownItPlugin.ts — Installs the blueprint-markdown directive grammar
 * into VS Code's built-in markdown-it instance.
 *
 * Three things are installed on VS Code's md:
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
 * VS Code's md (which now has our block rule) would re-trigger it.
 */

import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import markdownItMark from 'markdown-it-mark'
import markdownItTaskLists from 'markdown-it-task-lists'
import { parseBlocks } from './core/parser'
import { buildRegistry } from './core/directives/index'
import { createMarkdownIt } from './core/markdownit'
import { installInlineRule } from './core/inline'
import { installFenceRenderer } from './core/fence'
import { installInlineCodeRenderer } from './core/inline-code'
import { createRenderTree } from './core/renderer'

// ─── Theme resolution ─────────────────────────────────────────────────────────

/**
 * Read blueprintMarkdown.theme from workspace config and resolve it to a
 * concrete 'light' or 'dark' value.  When set to 'auto', falls back to VS Code's
 * active color theme kind.  Called fresh on every render so changes are picked up
 * without restarting the extension.
 */
function resolveTheme(): string {
  const setting = vscode.workspace
    .getConfiguration('blueprintMarkdown')
    .get<string>('theme', 'light')
  if (setting !== 'auto') return setting
  // 'auto' — follow VS Code's active color theme
  const kind = vscode.window.activeColorTheme.kind
  return (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast)
    ? 'dark'
    : 'light'
}

/** Read blueprintMarkdown.mindmapHeight from workspace config. */
function resolveMindmapHeight(): number {
  return vscode.workspace
    .getConfiguration('blueprintMarkdown')
    .get<number>('mindmapHeight', 480)
}

/** Read blueprintMarkdown.toc from workspace config: 'off' | 'h2' | 'h3'. */
function resolveToc(): string {
  return vscode.workspace
    .getConfiguration('blueprintMarkdown')
    .get<string>('toc', 'h3')
}

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

export function installEnhancedMarkdown(md: MarkdownIt): MarkdownIt {
  // Build the directive registry (same set as the web viewer).
  const registry = buildRegistry()

  // Private markdown-it instance for rendering text runs INSIDE directives.
  // Using VS Code's md here would re-trigger our block rule → infinite recursion.
  // The renderText hook in createRenderTree was designed exactly for this case.
  const privateMd = createMarkdownIt()
  installInlineRule(privateMd, registry)

  // renderTree: walks the AST produced by parseBlocks and returns an HTML string.
  const renderTree = createRenderTree(
    privateMd,
    registry,
    undefined,
    (src) => privateMd.render(src),  // renderText → private md only, never outer
  )

  // ── Install on VS Code's md ──

  // Inline directives (:chip[Active]{primary}, :icon{home}, etc.)
  installInlineRule(md, registry)

  // Custom fence renderer: line highlighting, title bars, mermaid div.
  // Supersedes VS Code's built-in fence highlighting; we call hljs ourselves.
  installFenceRenderer(md)

  // Custom inline-code renderer: file refs as clickable links.
  installInlineCodeRenderer(md)

  // ==highlight== and - [ ] / - [x] — must be on VS Code's md, not just privateMd.
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
    // token.map = [startLine, endLine + 1] tells VS Code's sourceMap rule
    // to stamp data-line / code-line on the rendered element → scroll sync.
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
  md.renderer.rules['em_directive'] = (tokens: Token[], idx: number): string => {
    const ast = parseBlocks(tokens[idx].content)
    return renderTree(ast)
  }

  // ── Theme marker ──
  //
  // A core rule that prepends a hidden <div data-em-theme="light|dark"
  // data-em-mindmap-height="480"> to the rendered output. preview.js reads
  // these values and stamps them on <body> so em-theme.css/hljs.css can key
  // off `body[data-em-theme="dark"]` and the mindmap canvas height picks up
  // the configured value via a CSS custom property.
  //
  // This runs on the OUTER md only (never privateMd) and calls resolveTheme()/
  // resolveMindmapHeight() fresh on every render so config changes are picked
  // up immediately after markdown.preview.refresh fires.
  md.core.ruler.push('em_theme_marker', (state: StateCore) => {
    // Skip nested renderInline() calls — inlineMode=true there — so the <div>
    // is never injected inside button/tooltip/chip anchor text.
    if (state.inlineMode) return false
    const theme = resolveTheme()
    const mindmapHeight = resolveMindmapHeight()
    const token = new state.Token('html_block', '', 0)
    token.content =
      `<div class="em-theme-config" data-em-theme="${theme}" ` +
      `data-em-mindmap-height="${mindmapHeight}" hidden></div>\n`
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
  // Depth is governed by blueprintMarkdown.toc ('off' | 'h2' | 'h3').
  // Skips docs with fewer than 2 headings — no rail needed for trivial pages.
  md.core.ruler.push('em_toc', (state: StateCore) => {
    if (state.inlineMode) return false

    const tocSetting = resolveToc()
    if (tocSetting === 'off') return false
    const HEADING_TAGS = new Set(tocSetting === 'h2' ? ['h1', 'h2'] : ['h1', 'h2', 'h3'])

    // ── Pass 1: collect headings, assign ids ──
    type HeadingEntry = { level: number; id: string; text: string }
    const entries: HeadingEntry[] = []
    const slugCount = new Map<string, number>()

    for (let i = 0; i < state.tokens.length; i++) {
      const tok = state.tokens[i]
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
      // any mismatch with VS Code's own GitHub slugifier.
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

/** Escape HTML special characters for safe attribute/text insertion. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
