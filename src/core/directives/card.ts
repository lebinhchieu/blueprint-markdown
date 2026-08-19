/**
 * card.ts — :::card and :::cards directives.
 *
 * :::card{title="…" icon=material_name}
 *   Body markdown
 * :::
 *
 * :::cards{cols=3 gap=md}
 *   :::card … :::
 * :::
 */

import type { DirectiveSpec } from '../types'
import { tocHeadingTag } from '../attrs'

export const cardDirectives: Record<string, DirectiveSpec> = {
  card: {
    forms: ['container'],
    render(node, ctx) {
      const title = node.attrs.named['title']
      const icon  = node.attrs.named['icon']
      const id    = node.attrs.id ? ` id="${ctx.esc(node.attrs.id)}"` : ''
      const cls   = node.attrs.classes.length ? ` ${node.attrs.classes.join(' ')}` : ''
      const titleTag = tocHeadingTag(node.attrs) ?? 'span'

      const iconHtml = icon
        ? `<span class="material-symbols-outlined card__icon">${ctx.esc(icon)}</span>`
        : ''

      const headerHtml = title || icon
        ? `<div class="card__header">${iconHtml}${title ? `<${titleTag} class="card__title">${ctx.renderInline(title)}</${titleTag}>` : ''}</div>`
        : ''

      const body = ctx.renderChildren(node)

      return `<div class="card${cls}"${id}>${headerHtml}<div class="card__body">${body}</div></div>`
    },
  },

  cards: {
    forms: ['container'],
    render(node, ctx) {
      const cols = node.attrs.named['cols'] ?? '1'
      const gap  = node.attrs.named['gap']  ?? 'md'
      const body = ctx.renderChildren(node)
      return `<div class="cards" data-cols="${ctx.esc(cols)}" data-gap="${ctx.esc(gap)}">${body}</div>`
    },
  },
}
