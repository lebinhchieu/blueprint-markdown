/**
 * disclosure.ts — :::details and :::accordion directives.
 *
 * :::details{title="Summary" open}
 *   content
 * :::
 *
 * `toc=h1|h2|h3` renders the title as a real heading (feeds the TOC rail and
 * the document outline) instead of plain summary text:
 * :::details{title="Case 1" toc=h2}
 *   …
 * :::
 *
 * :::accordion
 *   :::details{title="A"} … :::
 *   :::details{title="B"} … :::
 * :::
 */

import type { DirectiveSpec, ASTNode } from '../types'
import { tocHeadingTag } from '../attrs'

/** Returns true if any descendant directive node is named `revision`. */
function hasRevisionDescendant(children: ASTNode[] | undefined): boolean {
  if (!children) return false
  for (const child of children) {
    if (child.type === 'directive') {
      if (child.name === 'revision') return true
      if (hasRevisionDescendant(child.children)) return true
    }
  }
  return false
}

export const disclosureDirectives: Record<string, DirectiveSpec> = {
  details: {
    forms: ['container'],
    render(node, ctx) {
      const title = node.attrs.named['title'] ?? 'Details'
      // "open" can arrive as primary arg OR as a named flag
      const isOpen =
        node.attrs.primary === 'open' ||
        node.attrs.flags.has('open') ||
        node.attrs.named['open'] === 'true' ||
        node.attrs.named['open'] === ''

      const openAttr = isOpen ? ' open' : ''
      const body     = ctx.renderChildren(node)
      const tocTag   = tocHeadingTag(node.attrs)
      const titleHtml = tocTag
        ? `<${tocTag} class="details__title">${ctx.renderInline(title)}</${tocTag}>`
        : ctx.renderInline(title)

      // Signal that a revision is nested inside — visible even when collapsed.
      const revBadge = hasRevisionDescendant(node.children)
        ? `<span class="details__revision-badge material-symbols-outlined" title="Contains a revision" aria-label="Contains a revision">history</span>`
        : ''

      return (
        `<details class="details"${openAttr}>` +
        `<summary class="details__summary">${titleHtml}${revBadge}</summary>` +
        `<div class="details__body">${body}</div></details>`
      )
    },
  },

  accordion: {
    forms: ['container'],
    render(node, ctx) {
      // data-accordion tells the hydration script to wire up coordinated collapse
      const body = ctx.renderChildren(node)
      return `<div class="accordion" data-accordion>${body}</div>`
    },
  },
}
