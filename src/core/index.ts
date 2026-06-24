/**
 * core/index.ts — Public API for the blueprint-markdown core engine.
 *
 * Usage:
 *   import { createRenderer } from '@core'
 *
 *   const { render } = createRenderer()
 *   document.getElementById('output').innerHTML = render(markdownSource)
 */

export type { CoreOptions, DirectiveSpec, DirectiveNode, ASTNode, Attrs, Form, RenderCtx } from './types'
export { parseBlocks } from './parser'
export { parseAttrs } from './attrs'
export { resolveColor, canonicalRole, COLOR_TOKENS } from './colors'
export { buildRegistry } from './directives/index'
export { createMarkdownIt } from './markdownit'
export { installInlineRule } from './inline'
export { createRenderTree } from './renderer'

import type { CoreOptions } from './types'
import { parseBlocks } from './parser'
import { buildRegistry } from './directives/index'
import { createMarkdownIt } from './markdownit'
import { installInlineRule } from './inline'
import { createRenderTree } from './renderer'

/**
 * Create a configured renderer instance.
 *
 * @param opts.directives  Override or extend the registry (name → spec)
 * @param opts.palette     Override the color palette mapping
 * @param opts.markdownItOptions  Passed to markdown-it constructor
 */
export function createRenderer(opts?: CoreOptions): { render: (src: string) => string } {
  const registry = buildRegistry(opts?.directives)
  const md = createMarkdownIt(opts?.markdownItOptions)

  // Wire the inline directive rule into markdown-it
  installInlineRule(md, registry)

  const renderTree = createRenderTree(md, registry, opts?.palette)

  return {
    render(src: string): string {
      const ast = parseBlocks(src)
      return renderTree(ast)
    },
  }
}
