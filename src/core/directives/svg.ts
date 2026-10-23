/**
 * svg.ts — :::svg directive.
 *
 * :::svg{title="Login flow" caption="Happy path" width=480}
 * <svg viewBox="0 0 100 50">…</svg>
 * :::
 *
 * The body is raw SVG, never markdown: ctx.renderChildren is NOT used (it would run
 * the text through markdown-it and mangle blank lines, `*x*`, `<`). We read the text
 * nodes verbatim and hand them to renderSvgBlock, which sanitizes.
 */

import type { DirectiveSpec } from '../types'
import { renderSvgBlock, renderSvgError } from '../svgBlock'

/** An AI habit: wrapping the svg in a fence inside :::svg. Unwrap exactly one such fence. */
function unwrapFence(lines: string[]): string[] {
  const first = lines.findIndex(l => l.trim() !== '')
  let last = lines.length - 1
  while (last >= 0 && lines[last].trim() === '') last--
  if (first < 0 || last <= first) return lines
  const open = lines[first].trim().match(/^(`{3,}|~{3,})\s*(svg|xml)?$/i)
  if (!open) return lines
  const close = lines[last].trim().match(/^(`{3,}|~{3,})$/)
  if (!close || close[1][0] !== open[1][0] || close[1].length < open[1].length) return lines
  const inner = lines.slice(first + 1, last)
  // A second fence line inside means this is not one single wrapping block.
  if (inner.some(l => /^\s*(`{3,}|~{3,})/.test(l))) return lines
  return inner
}

export const svgDirectives: Record<string, DirectiveSpec> = {
  svg: {
    forms: ['container'],
    render(node, ctx) {
      const named = node.attrs.named
      const children = node.children ?? []
      // A nested directive (or anything but text) cannot be SVG: readable error, not a half drawing.
      if (children.some(c => c.type !== 'text')) {
        return renderSvgError('', { kind: 'malformed' }, ctx.esc, '')
      }
      let lines: string[] = []
      for (const c of children) if (c.type === 'text') for (const l of c.lines) lines.push(l)
      const src = unwrapFence(lines).join('\n')
      return renderSvgBlock(
        src,
        { title: named['title'], caption: named['caption'], width: named['width'] },
        ctx.esc,
        ctx.renderInline,
      )
    },
  },
}
