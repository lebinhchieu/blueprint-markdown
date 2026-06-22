/**
 * timeline.ts — :::timeline and :::event directives.
 *
 * :::timeline
 *   :::event{date="2024-01" icon=rocket color=primary}
 *     **Launch** — first release.
 *   :::
 *   :::event{date="2024-06" color=success}
 *     Milestone reached.
 *   :::
 * :::
 */

import type { DirectiveSpec } from '../types'
import { canonicalRole, resolveColor } from '../colors'

export const timelineDirectives: Record<string, DirectiveSpec> = {
  timeline: {
    forms: ['container'],
    render(node, ctx) {
      const body = ctx.renderChildren(node)
      return `<div class="timeline">${body}</div>`
    },
  },

  event: {
    forms: ['container'],
    render(node, ctx) {
      const date  = node.attrs.named['date']
      const icon  = node.attrs.named['icon']
      const color = node.attrs.named['color'] ?? node.attrs.primary
      const role  = color ? canonicalRole(color) : ''
      const cssColor = resolveColor(color)
      const colorAttr = cssColor ? ` style="--event-color:${cssColor}"` : ''
      const roleClass = role ? ` timeline-event--${ctx.esc(role)}` : ''

      const dotHtml = icon
        ? `<span class="material-symbols-outlined timeline-event__dot">${ctx.esc(icon)}</span>`
        : `<span class="timeline-event__dot"></span>`

      const dateHtml = date
        ? `<span class="timeline-event__date">${ctx.esc(date)}</span>`
        : ''

      const body = ctx.renderChildren(node)

      return (
        `<div class="timeline-event${roleClass}"${colorAttr}>` +
        `<div class="timeline-event__marker">${dotHtml}${dateHtml}</div>` +
        `<div class="timeline-event__content">${body}</div></div>`
      )
    },
  },
}
