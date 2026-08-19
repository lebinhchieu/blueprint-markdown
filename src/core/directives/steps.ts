/**
 * steps.ts — :::steps and :::step directives.
 *
 * :::steps
 *   :::step{title="Install"}
 *     Run `npm install`.
 *   :::
 *   :::step{title="Configure"}
 *     Edit config.json.
 *   :::
 * :::
 *
 * Steps are auto-numbered via CSS counter.
 */

import type { DirectiveSpec } from '../types'
import { tocHeadingTag } from '../attrs'

export const stepsDirectives: Record<string, DirectiveSpec> = {
  steps: {
    forms: ['container'],
    render(node, ctx) {
      const body = ctx.renderChildren(node)
      return `<div class="steps">${body}</div>`
    },
  },

  step: {
    forms: ['container'],
    render(node, ctx) {
      const title = node.attrs.named['title']
      const titleTag = tocHeadingTag(node.attrs) ?? 'div'
      const titleHtml = title
        ? `<${titleTag} class="step__title">${ctx.renderInline(title)}</${titleTag}>`
        : ''
      const body = ctx.renderChildren(node)
      return `<div class="step">${titleHtml}<div class="step__body">${body}</div></div>`
    },
  },
}
