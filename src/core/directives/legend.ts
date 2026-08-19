/**
 * legend.ts — :::legend and ::legend-item directives.
 *
 * Wraps a mermaid diagram (or any content) and declares a color→meaning legend
 * for it, rendered as a panel in the diagram's top-left corner, shown expanded
 * by default — click it to collapse to a small button, click again to expand
 * (see enhanceMermaidZoom in mermaidPanZoom.ts). Layout (row vs column) is
 * decided client-side from the diagram's own aspect ratio.
 *
 * :::legend
 * ```mermaid
 * graph TD
 *   A[Start]:::primary --> B[Done]:::success
 * ```
 * ::legend-item{color=primary label="Entry point"}
 * ::legend-item{color=success label="Terminal state"}
 * :::
 *
 * legend-item children are pulled out of the normal render flow and used to
 * build the legend panel; everything else renders exactly as it would without
 * :::legend (so the mermaid fence still becomes the usual placeholder div —
 * see fence.ts). The panel is emitted as a sibling of that div, never a
 * child, since previewRuntime.ts reads the mermaid div's own textContent as
 * the diagram source.
 */

import type { ASTNode, DirectiveNode, DirectiveSpec, RenderCtx } from '../types'

function isLegendItem(node: ASTNode): node is DirectiveNode {
  return node.type === 'directive' && node.name === 'legend-item'
}

function legendItemHtml(node: DirectiveNode, ctx: RenderCtx): string {
  const colorToken = node.attrs.named['color'] ?? node.attrs.primary ?? 'gray'
  const color = ctx.resolveColor(colorToken) ?? 'var(--c-gray)'
  const label = node.attrs.named['label'] ?? ''
  return (
    `<span class="em-mermaid__legend-item">` +
    `<span class="hex-swatch" style="background:${color}"></span>${ctx.esc(label)}</span>`
  )
}

export const legendDirectives: Record<string, DirectiveSpec> = {
  legend: {
    forms: ['container'],
    render(node, ctx) {
      const children = node.children ?? []
      const items = children.filter(isLegendItem)
      // Render everything else through the normal path via a synthetic node —
      // renderChildren only ever reads `children` (same trick explorer.ts uses).
      const rest = children.filter(c => !isLegendItem(c))
      const contentHtml = ctx.renderChildren({ ...node, children: rest })

      if (items.length === 0) return contentHtml // no items — fail-soft, nothing to add

      const itemsHtml = items.map(item => legendItemHtml(item, ctx)).join('')
      return (
        `<div class="em-legend-wrap">${contentHtml}` +
        `<div class="em-mermaid__legend">${itemsHtml}</div></div>`
      )
    },
  },

  // ::legend-item is only meaningful as a child of :::legend. Rendered
  // standalone (outside :::legend), it's a plain inline swatch+label —
  // fail-soft, mirroring how :::tab renders standalone.
  'legend-item': {
    forms: ['leaf'],
    render(node, ctx) {
      return legendItemHtml(node, ctx)
    },
  },
}
