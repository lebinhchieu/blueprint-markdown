/**
 * tabs.ts — :::tabs and :::tab directives.
 *
 * :::tabs
 *   :::tab{title="npm"}
 *     `npm install x`
 *   :::
 *   :::tab{title="pnpm"}
 *     `pnpm add x`
 *   :::
 * :::
 *
 * Tab switching is handled by the hydrate() function in hydrate.ts
 * (looks for [data-tabs] containers and wires click events).
 */

import type { DirectiveSpec, DirectiveNode } from '../types'

export const tabsDirectives: Record<string, DirectiveSpec> = {
  tabs: {
    forms: ['container'],
    render(node, ctx) {
      // Collect only :::tab children to build the tab list
      const tabNodes = (node.children ?? []).filter(
        (c): c is DirectiveNode => c.type === 'directive' && c.name === 'tab',
      )

      // Tab list (buttons)
      const tabListHtml = tabNodes
        .map((tab, i) => {
          const title = tab.attrs.named['title'] ?? `Tab ${i + 1}`
          const active = i === 0 ? ' data-active' : ''
          return `<button class="tab-btn" role="tab"${active} data-tab-index="${i}">${ctx.renderInline(title)}</button>`
        })
        .join('')

      // Tab panels — delegate body rendering via ctx (so nested content works)
      const panelsHtml = tabNodes
        .map((tab, i) => {
          const active  = i === 0 ? ' data-active' : ''
          const content = ctx.renderChildren(tab)
          return `<div class="tab-panel" role="tabpanel" data-tab-index="${i}"${active}>${content}</div>`
        })
        .join('')

      return (
        `<div class="tabs" data-tabs>` +
        `<div class="tab-list" role="tablist">${tabListHtml}</div>` +
        `<div class="tab-panels">${panelsHtml}</div></div>`
      )
    },
  },

  // :::tab is only meaningful as a child of :::tabs.
  // Rendering it standalone produces a passthrough (fail-soft would also work, but
  // standalone :::tab is valid author input and should not look broken).
  tab: {
    forms: ['container'],
    render(node, ctx) {
      // Standalone: just render the body without the tab chrome
      return ctx.renderChildren(node)
    },
  },
}
