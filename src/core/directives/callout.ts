/**
 * callout.ts — :::callout and the 6 named shorthand types.
 *
 * :::note / :::tip / :::info / :::warning / :::danger / :::success
 *   (all alias to callout with a preset type)
 *
 * :::callout{type=info title="Custom" icon=info}
 *   Content
 * :::
 *
 * :::warning{title="Heads up"}
 *   …
 * :::
 */

import type { DirectiveSpec } from '../types'
import { canonicalRole } from '../colors'

/** Default icon for each callout type */
const TYPE_ICONS: Record<string, string> = {
  note:    'info',
  tip:     'lightbulb',
  info:    'info',
  warning: 'warning',
  danger:  'error',
  success: 'check_circle',
}

function calloutRender(
  type: string,
  node: Parameters<DirectiveSpec['render']>[0],
  ctx: Parameters<DirectiveSpec['render']>[1],
): string {
  const role   = canonicalRole(type) // 'success', 'warning', etc.
  const title  = node.attrs.named['title']
  const icon   = node.attrs.named['icon'] ?? TYPE_ICONS[type] ?? TYPE_ICONS[role]
  const body   = ctx.renderChildren(node)

  const iconHtml = icon
    ? `<span class="material-symbols-outlined callout__icon">${ctx.esc(icon)}</span>`
    : ''

  if (title) {
    const titleHtml =
      `<div class="callout__header">${iconHtml}<span class="callout__title">${ctx.renderInline(title)}</span></div>`
    return `<div class="callout callout--${ctx.esc(role)}">${titleHtml}<div class="callout__body">${body}</div></div>`
  }

  // No title: icon sits inline with the body content
  return `<div class="callout callout--${ctx.esc(role)} callout--inline">${iconHtml}<div class="callout__body">${body}</div></div>`
}

/** The generic callout — type comes from attrs */
const calloutSpec: DirectiveSpec = {
  forms: ['container'],
  render(node, ctx) {
    const type = node.attrs.named['type'] ?? node.attrs.primary ?? 'info'
    return calloutRender(type, node, ctx)
  },
}

/** Create an alias that pre-fills the type */
function namedCallout(type: string): DirectiveSpec {
  return {
    forms: ['container'],
    render(node, ctx) {
      // Allow named variants to also accept a title/icon override
      const mergedNode = {
        ...node,
        attrs: {
          ...node.attrs,
          named: { type, ...node.attrs.named },
        },
      }
      return calloutRender(type, mergedNode, ctx)
    },
  }
}

export const calloutDirectives: Record<string, DirectiveSpec> = {
  callout: calloutSpec,
  note:    namedCallout('note'),
  tip:     namedCallout('tip'),
  info:    namedCallout('info'),
  warning: namedCallout('warning'),
  danger:  namedCallout('danger'),
  success: namedCallout('success'),
}
