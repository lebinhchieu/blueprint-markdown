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
  // A core rule that prepends a hidden <div data-em-theme="light|dark"> to the
  // rendered output.  preview.js reads this value and stamps it on <body> so
  // em-theme.css and hljs.css can key off `body[data-em-theme="dark"]`.
  //
  // This runs on the OUTER md only (never privateMd) and calls resolveTheme()
  // fresh on every render so config changes are picked up immediately after
  // markdown.preview.refresh fires.
  md.core.ruler.push('em_theme_marker', (state: StateCore) => {
    // Skip nested renderInline() calls — inlineMode=true there — so the <div>
    // is never injected inside button/tooltip/chip anchor text.
    if (state.inlineMode) return false
    const theme = resolveTheme()
    const token = new state.Token('html_block', '', 0)
    token.content = `<div class="em-theme-config" data-em-theme="${theme}" hidden></div>\n`
    state.tokens.unshift(token)
    return false   // non-terminating; let other core rules run
  })

  return md
}
