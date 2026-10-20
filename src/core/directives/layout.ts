/**
 * layout.ts — :::columns and :::col directives.
 *
 * :::columns{count=2 gap=lg}
 *   :::col
 *     Left content
 *   :::
 *   :::col{span=2}
 *     Wide right content
 *   :::
 * :::
 *
 * :::columns{min=320px}      — as many columns as fit, each at least 320px wide
 * :::col{sticky}             — stays pinned while a taller sibling column scrolls
 */

import type { DirectiveSpec } from '../types'

/** A bare number plus a CSS unit, e.g. 320px, 20rem, 30ch. */
const CSS_LENGTH = /^\d{1,4}(\.\d{1,2})?(px|rem|em|ch)$/

export const layoutDirectives: Record<string, DirectiveSpec> = {
  columns: {
    forms: ['container'],
    render(node, ctx) {
      const count = node.attrs.named['count'] ?? '2'
      const gap   = node.attrs.named['gap']   ?? 'md'
      const min   = node.attrs.named['min']
      const body  = ctx.renderChildren(node)
      // min= switches to auto-fit; only a plain CSS length is allowed into the style attr.
      const fit = min && CSS_LENGTH.test(min)
        ? ` data-fit style="--col-min:${min}"`
        : ''
      return (
        `<div class="columns" data-count="${ctx.esc(count)}" data-gap="${ctx.esc(gap)}"${fit}>` +
        `${body}</div>`
      )
    },
  },

  col: {
    forms: ['container'],
    render(node, ctx) {
      const span = node.attrs.named['span']
      const spanAttr = span ? ` data-span="${ctx.esc(span)}"` : ''
      const stickyAttr = node.attrs.primary === 'sticky' || node.attrs.flags.has('sticky') ? ' data-sticky' : ''
      const body = ctx.renderChildren(node)
      return `<div class="col"${spanAttr}${stickyAttr}>${body}</div>`
    },
  },
}
