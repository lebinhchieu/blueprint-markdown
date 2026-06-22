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
 */

import type { DirectiveSpec } from '../types'

export const layoutDirectives: Record<string, DirectiveSpec> = {
  columns: {
    forms: ['container'],
    render(node, ctx) {
      const count = node.attrs.named['count'] ?? '2'
      const gap   = node.attrs.named['gap']   ?? 'md'
      const body  = ctx.renderChildren(node)
      return (
        `<div class="columns" data-count="${ctx.esc(count)}" data-gap="${ctx.esc(gap)}">` +
        `${body}</div>`
      )
    },
  },

  col: {
    forms: ['container'],
    render(node, ctx) {
      const span = node.attrs.named['span']
      const spanAttr = span ? ` data-span="${ctx.esc(span)}"` : ''
      const body = ctx.renderChildren(node)
      return `<div class="col"${spanAttr}>${body}</div>`
    },
  },
}
