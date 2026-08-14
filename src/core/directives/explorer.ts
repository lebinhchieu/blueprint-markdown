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

import type { ASTNode, DirectiveSpec } from '../types'

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

/** Only accept a width that is unambiguously a CSS length — this value is
 *  interpolated into a style attribute, so an unvalidated string would let
 *  markdown source inject arbitrary declarations. */
const RE_WIDTH = /^\d+(\.\d+)?(%|px|rem|em|ch|vw)$/

/**
 * One heading element. The lazy body stops at the first matching close tag,
 * and headings cannot nest, so each match is bounded to a single heading.
 *
 * Matching the anchor in the same pass — `…\{#(id)\}\s*</h\1>` — looks
 * equivalent and is not: on a heading with no trailing anchor the body would
 * run straight past its own close tag and swallow later headings, stamping
 * their id onto the wrong element. Bound the heading first, test the anchor
 * second.
 */
const RE_HEADING = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g

/** A `{#id}` at the very end of a heading's content, and nowhere else. */
const RE_TRAILING_ANCHOR = /^([\s\S]*?)\s*\{#([A-Za-z][\w-]*)\}\s*$/

/**
 * Move a heading's trailing `{#id}` into `data-em-key` and drop it from the
 * visible text.
 *
 * markdown-it-attrs is deliberately not installed (it would double-parse our
 * directive `{}` attrs), so without this pass the braces would simply render
 * as literal text in the heading. The em_toc rule (markdownItPlugin.ts) reads
 * this same `{#id}` convention separately, from the raw directive content
 * before it's rendered, to give directive-internal headings a ToC entry.
 *
 * Operating on our own just-generated HTML rather than the markdown source
 * keeps the id off the `renderChildren` path, so no other directive is
 * affected. The `\s*</h\2>` tail is what pins the match to a *trailing*
 * anchor, so a `{#…}` written mid-heading is left alone as ordinary text.
 */
export function extractHeadingKeys(html: string): string {
  return html.replace(RE_HEADING, (whole, level: string, attrs: string, inner: string) => {
    const anchor = inner.match(RE_TRAILING_ANCHOR)
    if (!anchor) return whole
    // The id charset excludes quotes, so it is safe in an attribute as-is.
    return `<h${level}${attrs} data-em-key="${anchor[2]}">${anchor[1]}</h${level}>`
  })
}

export const explorerDirectives: Record<string, DirectiveSpec> = {
  explorer: {
    forms: ['container'],
    render(node, ctx) {
      const { pin, detail } = splitAtMermaidFence(node.children)

      const pinSide = node.attrs.named['pin'] === 'top' ? 'top' : 'left'
      const rawWidth = node.attrs.named['width'] ?? '45%'
      const width = RE_WIDTH.test(rawWidth) ? rawWidth : '45%'

      // Render each half through a synthetic node — renderChildren only ever
      // reads `children`, so this needs no change to renderer.ts or RenderCtx.
      const pinHtml = ctx.renderChildren({ ...node, children: pin })
      const detailHtml = extractHeadingKeys(ctx.renderChildren({ ...node, children: detail }))

      return (
        `<div class="em-explorer" data-pin="${pinSide}" style="--em-explorer-pin-width:${width}">` +
        `<div class="em-explorer__pin">${pinHtml}</div>` +
        `<div class="em-explorer__detail">${detailHtml}</div>` +
        `</div>`
      )
    },
  },
}
