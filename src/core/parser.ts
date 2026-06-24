/**
 * parser.ts — Recursive line-based pre-parser for enhanced-markdown directives.
 *
 * Pipeline: source string → parseBlocks() → ASTNode[]
 *
 * The parser is GENERIC — it never imports the directive registry.
 * It produces a tree of TextNode (runs of plain lines) and DirectiveNode
 * (containers with children, leaves, or inline markers). The renderer
 * then walks the tree and dispatches to the registry.
 *
 * Grammar handled:
 *   :::name{attrs}  → OPEN container  (depth via recursion)
 *   :::             → CLOSE container
 *   ::name{attrs}   → LEAF block (single line, no children)
 *   :name[text]{attrs} → stays in TEXT runs; handled by the inline md.inline rule
 *
 * Key invariants:
 *  - Fenced code blocks are opaque: lines inside ``` / ~~~ are never classified.
 *  - CLOSE vs OPEN distinguished by "name char immediately after the colons."
 *  - Depth = recursion depth (no manual counter needed).
 *  - Unclosed containers at EOF: marked `closed: false`, rendered fail-soft.
 *  - Stray CLOSE at top level (no matching OPEN) → treated as TEXT.
 */

import type { ASTNode, TextNode, DirectiveNode, Attrs } from './types'
import { parseAttrs } from './attrs'

// ─── Line classification ──────────────────────────────────────────────────

type LineType =
  | { kind: 'CLOSE' }
  | { kind: 'OPEN';  name: string; attrsRaw: string }
  | { kind: 'LEAF';  name: string; attrsRaw: string }
  | { kind: 'TEXT' }

// Must test CLOSE before OPEN because ':::' with nothing after is a close,
// not an open with an empty name.
const RE_CLOSE = /^\s*:::\s*$/
const RE_OPEN  = /^\s*:::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/
const RE_LEAF  = /^\s*::([A-Za-z][\w-]*)(\{(?:"(?:\\.|[^"\\])*"|[^{}"])*\})?\s*$/

function classifyLine(line: string): LineType {
  if (RE_CLOSE.test(line)) return { kind: 'CLOSE' }
  const m3 = line.match(RE_OPEN)
  if (m3) return { kind: 'OPEN', name: m3[1], attrsRaw: m3[2] ?? '' }
  const m2 = line.match(RE_LEAF)
  if (m2) return { kind: 'LEAF', name: m2[1], attrsRaw: m2[2] ?? '' }
  return { kind: 'TEXT' }
}

// ─── Fence state machine ──────────────────────────────────────────────────

interface FenceMarker {
  char: string  // '`' or '~'
  len: number   // number of characters (≥ 3)
}

/** Match an opening or closing fence line. Returns null if not a fence. */
function matchFence(line: string): FenceMarker | null {
  const m = line.match(/^(\s*)(```+|~~~+)/)
  if (!m) return null
  const seq = m[2]
  return { char: seq[0], len: seq.length }
}

// ─── Core recursive parser ────────────────────────────────────────────────

interface ParseResult {
  nodes: ASTNode[]
  /** Next index to continue from */
  nextIndex: number
  /** true if the inner block was closed by an explicit ::: line */
  closedByFence: boolean
}

/**
 * Parse a slice of lines into an array of ASTNodes.
 *
 * @param lines     All source lines
 * @param start     Index to begin from
 * @param stopAtClose  If true, return when a CLOSE line is encountered
 *                      (consuming the CLOSE line). Used for nested parse.
 */
function parseBlock(lines: string[], start: number, stopAtClose: boolean): ParseResult {
  const nodes: ASTNode[] = []
  let textLines: string[] = []
  let i = start
  let inFence = false
  let fenceMarker: FenceMarker | null = null

  function flushText(): void {
    if (textLines.length > 0) {
      nodes.push({ type: 'text', lines: textLines })
      textLines = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // ── Fence state machine ──
    const fm = matchFence(line)
    if (!inFence && fm) {
      inFence = true
      fenceMarker = fm
      textLines.push(line)
      i++
      continue
    }
    if (inFence) {
      if (fm && fm.char === fenceMarker!.char && fm.len >= fenceMarker!.len) {
        inFence = false
        fenceMarker = null
      }
      textLines.push(line)
      i++
      continue
    }

    // ── Classify ──
    const cls = classifyLine(line)

    if (cls.kind === 'CLOSE') {
      if (stopAtClose) {
        flushText()
        return { nodes, nextIndex: i + 1, closedByFence: true }
      }
      // Stray close at top level → literal text
      textLines.push(line)
      i++
      continue
    }

    if (cls.kind === 'OPEN') {
      flushText()
      const attrs: Attrs = parseAttrs(cls.attrsRaw)
      // Recurse into the container body
      const inner = parseBlock(lines, i + 1, true)
      const node: DirectiveNode = {
        type: 'directive',
        form: 'container',
        name: cls.name,
        attrs,
        children: inner.nodes,
        closed: inner.closedByFence,
      }
      nodes.push(node)
      i = inner.nextIndex
      continue
    }

    if (cls.kind === 'LEAF') {
      flushText()
      const attrs: Attrs = parseAttrs(cls.attrsRaw)
      const node: DirectiveNode = {
        type: 'directive',
        form: 'leaf',
        name: cls.name,
        attrs,
        closed: true,
      }
      nodes.push(node)
      i++
      continue
    }

    // TEXT
    textLines.push(line)
    i++
  }

  flushText()
  return { nodes, nextIndex: i, closedByFence: false }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Parse an enhanced-markdown source string into an AST.
 */
export function parseBlocks(source: string): ASTNode[] {
  const lines = source.split('\n')
  const result = parseBlock(lines, 0, false)
  return result.nodes
}

// Re-export types for convenience
export type { ASTNode, TextNode, DirectiveNode }
