/**
 * compare.ts — :::compare, a before/after pair shown side by side.
 *
 * :::compare
 * :::before{title="Old"}
 * What it was.
 * :::
 * :::after{title="New"}
 * What it is now.
 * :::
 * :::
 *
 * Unlike :::revision (which hides the previous text behind a marker), both sides are
 * visible at once. Sides stack on narrow screens. Titles default to Before / After.
 */

import type { DirectiveNode, DirectiveSpec } from '../types'

function side(kind: 'before' | 'after'): DirectiveSpec {
  const fallback = kind === 'before' ? 'Before' : 'After'
  return {
    forms: ['container'],
    render(node, ctx) {
      const title = node.attrs.named['title'] ?? fallback
      return (
        `<div class="compare__side compare__side--${kind}">` +
        `<div class="compare__title">${ctx.renderInline(title)}</div>` +
        `<div class="compare__body">${ctx.renderChildren(node)}</div>` +
        `</div>`
      )
    },
  }
}

export const compareDirectives: Record<string, DirectiveSpec> = {
  compare: {
    forms: ['container'],
    render(node, ctx) {
      // Only before/after children are sides; order is fixed (before first) regardless of source order.
      const pick = (name: string) => (node.children ?? []).filter(
        (c): c is DirectiveNode => c.type === 'directive' && c.name === name,
      )
      const sides = [...pick('before'), ...pick('after')]
      return `<div class="compare">${ctx.renderChildren({ ...node, children: sides })}</div>`
    },
  },
  before: side('before'),
  after:  side('after'),
}
