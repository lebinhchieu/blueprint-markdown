/**
 * mindmap.ts — :::mindmap directive.
 *
 * Turns heading-structured markdown into an interactive node-graph. Heading
 * level = tree depth; `[[id]]` in a body creates a dashed cross-link. See
 * mindmap-design.md for the full authoring format and rationale.
 *
 * render() only parses the heading tree into {nodes, edges} and emits an
 * empty, sized placeholder with the graph JSON attached — the graph itself
 * is built client-side by src/core/mindmap/mountMindmap.ts, mirroring how
 * fence.ts emits an empty <div class="mermaid"> for mermaid.js to fill in
 * after DOM insert.
 *
 * :::mindmap
 *
 * # Database latency > 2s
 * Dashboards spin on every load.
 *
 * ## Add Redis cache {#redis}
 * Cache hot queries; TTL 60s.
 *
 * :::
 */

import type { ASTNode, DirectiveSpec, TextNode } from '../types'
import { parseMindmap } from '../mindmap/parseMindmap'

function extractSource(children: ASTNode[] | undefined): string {
  if (!children) return ''
  return children
    .filter((n): n is TextNode => n.type === 'text')
    .map(n => n.lines.join('\n'))
    .join('\n')
}

export const mindmapDirectives: Record<string, DirectiveSpec> = {
  mindmap: {
    forms: ['container'],
    render(node, ctx) {
      const graph = parseMindmap(extractSource(node.children))
      if (graph.nodes.length === 0) {
        return (
          '<div class="directive-unknown" data-directive="mindmap">' +
          '<span class="directive-unknown__label">mindmap</span>' +
          'No headings found — add at least one # heading inside the block.</div>'
        )
      }
      return `<div class="em-mindmap" data-graph="${ctx.esc(JSON.stringify(graph))}"></div>`
    },
  },
}
