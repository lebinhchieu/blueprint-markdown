/**
 * disclosure.ts — :::details and :::accordion directives.
 *
 * :::details{title="Summary" open}
 *   content
 * :::
 *
 * :::accordion
 *   :::details{title="A"} … :::
 *   :::details{title="B"} … :::
 * :::
 */

import type { DirectiveSpec } from '../types'

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

      return (
        `<details class="details"${openAttr}>` +
        `<summary class="details__summary">${ctx.renderInline(title)}</summary>` +
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
