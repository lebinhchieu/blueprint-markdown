/**
 * explorer.ts — :::explorer directive.
 *
 * Renders a master-detail view: the first mermaid fence pins in place while
 * the per-node detail sections scroll beside it. Node↔section pairing is done
 * entirely client-side by src/core/explorerSync.ts — both halves of the pair
 * already exist in the DOM, so there is nothing to keep in sync across the
 * server/browser boundary.
 *
 * :::explorer
 * ```mermaid
 * graph TD
 *   N1["1. AuthService"] --> N2["2. TokenStore"]
 * ```
 *
 * ### 1. AuthService — `src/auth/service.ts:44`
 * Validates creds, issues JWT.
 * :::
 */

import type { ASTNode } from '../types'

const RE_FENCE = /^(\s*)(`{3,}|~{3,})/

export interface ExplorerSplit {
  /** Lines up to and including the first mermaid fence's closing line. */
  pin: ASTNode[]
  /** Everything after it: the rest of that text node plus all later siblings. */
  detail: ASTNode[]
}

/**
 * Split a container's children at the first mermaid fence.
 *
 * Fenced blocks live inside a single TextNode (parser.ts pushes fence lines
 * straight into the current text run), so the split happens *within* one
 * node's lines — but any sibling nodes after it, such as a nested
 * :::warning, belong to the detail pane and must be carried across.
 *
 * Fail-soft: with no mermaid fence, `pin` is empty and everything renders as
 * detail, which reads exactly like plain markdown.
 */
export function splitAtMermaidFence(children: ASTNode[] | undefined): ExplorerSplit {
  if (!children) return { pin: [], detail: [] }

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type !== 'text') continue

    const end = mermaidFenceEnd(child.lines)
    if (end === -1) continue

    const tail = child.lines.slice(end + 1)
    const detail: ASTNode[] = []
    if (tail.length > 0) detail.push({ type: 'text', lines: tail })
    detail.push(...children.slice(i + 1))

    return { pin: [{ type: 'text', lines: child.lines.slice(0, end + 1) }], detail }
  }

  return { pin: [], detail: children }
}

/** Index of the closing line of the first *mermaid* fence, or -1 if there is none. */
function mermaidFenceEnd(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RE_FENCE)
    if (!m) continue
    const marker = m[2]
    const info = lines[i].slice(m[0].length).trim().toLowerCase()
    if (info.startsWith('mermaid')) return closeIndex(lines, i, marker)
    // A different fence opened first — skip it whole, so a ```mermaid nested
    // inside a ````markdown example is never mistaken for the real diagram.
    i = closeIndex(lines, i, marker)
  }
  return -1
}

/** Index of the line closing the fence opened at `open`; last line if unclosed. */
function closeIndex(lines: string[], open: number, marker: string): number {
  for (let i = open + 1; i < lines.length; i++) {
    const m = lines[i].match(RE_FENCE)
    if (m && m[2][0] === marker[0] && m[2].length >= marker.length) return i
  }
  return lines.length - 1
}
