/**
 * renderer.ts — Walk the AST and produce an HTML string.
 *
 * text nodes → md.render(lines.join('\n'))
 * directive nodes → registry[name].render(node, ctx)
 * unknown / wrong-form nodes → visible labelled fallback (fail-soft)
 *
 * Public API: createRenderTree(md, registry, customPalette) → (nodes) → html
 */

import type MarkdownIt from 'markdown-it'
import type { ASTNode, DirectiveNode, RenderCtx } from './types'
import type { Registry } from './directives/index'
import { resolveColor } from './colors'

// ─── Internal extended context ────────────────────────────────────────────

interface InternalCtx extends RenderCtx {
  _renderText: (lines: string[]) => string
  _registry: Registry
}

// ─── Node renderers ───────────────────────────────────────────────────────

function renderNode(node: ASTNode, ctx: InternalCtx): string {
  if (node.type === 'text') {
    return ctx._renderText(node.lines)
  }
  return renderDirective(node, ctx)
}

function renderDirective(node: DirectiveNode, ctx: InternalCtx): string {
  const spec = ctx._registry[node.name]

  if (!spec || !spec.forms.includes(node.form)) {
    return failSoft(node, ctx)
  }

  // Unclosed container: render children but wrap in a visual warning
  if (node.form === 'container' && node.closed === false) {
    const inner = ctx.renderChildren(node)
    return `<div class="directive-unclosed" data-directive="${ctx.esc(node.name)}">${inner}</div>`
  }

  return spec.render(node, ctx)
}

function failSoft(node: DirectiveNode, ctx: InternalCtx): string {
  const inner = node.children
    ? ctx.renderChildren(node)
    : node.text
      ? ctx.esc(node.text)
      : ''
  return (
    `<div class="directive-unknown" data-directive="${ctx.esc(node.name)}">` +
    `<span class="directive-unknown__label">${ctx.esc(node.name)}</span>` +
    `${inner}</div>`
  )
}

// ─── Public factory ───────────────────────────────────────────────────────

/**
 * Returns a render function: nodes → html string.
 * Call once per renderer instance; the returned function is reusable.
 *
 * @param renderText  Optional override for rendering plain text blocks.
 *   Defaults to md.render(). Pass an alternative when md.render has been
 *   overridden (e.g. in a VSCode extension) to avoid infinite recursion.
 */
export function createRenderTree(
  md: MarkdownIt,
  registry: Registry,
  customPalette?: Record<string, string>,
  renderText?: (src: string) => string,
): (nodes: ASTNode[]) => string {
  const ctx: InternalCtx = {
    _renderText(lines: string[]): string {
      const text = lines.join('\n')
      if (!text.trim()) return ''
      return renderText ? renderText(text) : md.render(text)
    },
    _registry: registry,

    renderChildren(node: DirectiveNode): string {
      if (!node.children) return ''
      return node.children.map(n => renderNode(n, ctx)).join('')
    },
    renderInline(markdown: string): string {
      return md.renderInline(markdown)
    },
    esc(s: string): string {
      return md.utils.escapeHtml(s)
    },
    resolveColor(token?: string): string | undefined {
      return resolveColor(token, customPalette)
    },
  }

  return (nodes: ASTNode[]) => nodes.map(n => renderNode(n, ctx)).join('')
}
