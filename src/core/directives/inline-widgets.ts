/**
 * inline-widgets.ts — All inline directive renderers.
 *
 * :chip[Active]{green}
 * :chip[Beta]{color=amber variant=outline}
 * :icon[home]
 * :icon[settings]{fill size=20 color=blue}
 * :color[text]{red}
 * :kbd[Ctrl+K]
 * :button[Get started]{href="/start" color=primary variant=solid}
 * :tooltip[hover me]{tip="explanation"}
 * :rating{value=4 max=5}
 */

import type { DirectiveSpec } from '../types'
import { canonicalRole, resolveColor } from '../colors'

// ─── :chip ────────────────────────────────────────────────────────────────

const chipSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const colorToken = node.attrs.named['color'] ?? node.attrs.primary ?? 'gray'
    const variant    = node.attrs.named['variant'] ?? 'soft'
    const role       = canonicalRole(colorToken)
    const text       = node.text ?? ''
    const cssColor   = resolveColor(colorToken)
    const styleAttr  = cssColor && /^#/.test(cssColor) ? ` style="--chip-color:${cssColor}"` : ''

    return (
      `<span class="chip chip--${ctx.esc(variant)} chip--${ctx.esc(role)}"${styleAttr}>` +
      `${ctx.esc(text)}</span>`
    )
  },
}

// ─── :icon ────────────────────────────────────────────────────────────────

const iconSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const name   = node.text ?? ''
    const fill   = node.attrs.flags.has('fill') || node.attrs.named['fill'] === 'true'
    const size   = node.attrs.named['size']
    const color  = node.attrs.named['color']
    const weight = node.attrs.named['weight']

    const cssColor = resolveColor(color)
    const styleVal = cssColor ? `color:${cssColor};` : ''
    const sizeVal  = size    ? `font-size:${ctx.esc(size)}px;` : ''
    const fillVal  = fill    ? `font-variation-settings:'FILL' 1;` : ''
    const weightVal = weight ? `font-weight:${ctx.esc(weight)};` : ''
    const style    = [sizeVal, fillVal, weightVal, styleVal].filter(Boolean).join('')
    const styleAttr = style ? ` style="${style}"` : ''
    const fillClass = fill ? ' icon--fill' : ''

    return (
      `<span class="material-symbols-outlined icon${fillClass}" aria-hidden="true"${styleAttr}>` +
      `${ctx.esc(name)}</span>`
    )
  },
}

// ─── :color ───────────────────────────────────────────────────────────────

const colorSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const colorToken = node.attrs.named['color'] ?? node.attrs.primary ?? ''
    const text       = node.text ?? ''
    const cssColor   = resolveColor(colorToken)
    const role       = canonicalRole(colorToken)
    const styleAttr  = cssColor ? ` style="color:${cssColor}"` : ''
    const roleClass  = role && !cssColor?.startsWith('#') ? ` color--${ctx.esc(role)}` : ''

    return `<span class="color${roleClass}"${styleAttr}>${ctx.renderInline(text)}</span>`
  },
}

// ─── :kbd ─────────────────────────────────────────────────────────────────

const kbdSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const text = node.text ?? ''
    const keys = text.split('+').map(k => `<kbd>${ctx.esc(k.trim())}</kbd>`)
    return `<span class="kbd-combo">${keys.join('<span class="kbd-sep">+</span>')}</span>`
  },
}

// ─── :button ──────────────────────────────────────────────────────────────

const buttonSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const href    = node.attrs.named['href'] ?? '#'
    const color   = node.attrs.named['color'] ?? 'primary'
    const variant = node.attrs.named['variant'] ?? 'solid'
    const text    = node.text ?? 'Button'
    const role    = canonicalRole(color)

    return (
      `<a class="btn btn--${ctx.esc(variant)} btn--${ctx.esc(role)}" href="${ctx.esc(href)}">` +
      `${ctx.renderInline(text)}</a>`
    )
  },
}

// ─── :tooltip ─────────────────────────────────────────────────────────────

const tooltipSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const tip  = node.attrs.named['tip'] ?? ''
    const text = node.text ?? ''
    return (
      `<span class="tooltip" data-tip="${ctx.esc(tip)}">` +
      `<span class="tooltip__trigger">${ctx.renderInline(text)}</span>` +
      `<span class="tooltip__content" role="tooltip">${ctx.renderInline(tip)}</span>` +
      `</span>`
    )
  },
}

// ─── :rating ──────────────────────────────────────────────────────────────

const ratingSpec: DirectiveSpec = {
  forms: ['inline'],
  render(node, ctx) {
    const value = parseFloat(node.attrs.named['value'] ?? node.attrs.primary ?? '0')
    const max   = parseInt(node.attrs.named['max'] ?? '5', 10)

    const stars = Array.from({ length: max }, (_, i) => {
      const filled = i < Math.round(value)
      return (
        `<span class="material-symbols-outlined rating__star${filled ? ' rating__star--filled' : ''}" aria-hidden="true">` +
        `${filled ? 'star' : 'star_border'}</span>`
      )
    }).join('')

    return (
      `<span class="rating" aria-label="${ctx.esc(String(value))} out of ${ctx.esc(String(max))} stars">` +
      `${stars}</span>`
    )
  },
}

export const inlineWidgetDirectives: Record<string, DirectiveSpec> = {
  chip:    chipSpec,
  icon:    iconSpec,
  color:   colorSpec,
  kbd:     kbdSpec,
  button:  buttonSpec,
  tooltip: tooltipSpec,
  rating:  ratingSpec,
}
