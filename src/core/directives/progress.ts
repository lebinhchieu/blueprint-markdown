/**
 * progress.ts — ::progress leaf directive.
 *
 * ::progress{value=65 max=100 color=primary label="Upload"}
 */

import type { DirectiveSpec } from '../types'
import { canonicalRole, resolveColor } from '../colors'

export const progressDirectives: Record<string, DirectiveSpec> = {
  progress: {
    forms: ['leaf'],
    render(node, ctx) {
      // value can be a named attr or the bare primary arg
      const valueStr = node.attrs.named['value'] ?? node.attrs.primary ?? '0'
      const maxStr   = node.attrs.named['max']   ?? '100'
      const color    = node.attrs.named['color'] ?? 'primary'
      const label    = node.attrs.named['label']

      const value = Math.min(Math.max(parseFloat(valueStr) || 0, 0), parseFloat(maxStr) || 100)
      const max   = parseFloat(maxStr) || 100
      const pct   = max > 0 ? (value / max) * 100 : 0
      const role  = canonicalRole(color)
      const cssColor = resolveColor(color)
      const colorStyle = cssColor ? ` --progress-fill:${cssColor}` : ''

      const labelHtml = label
        ? `<div class="progress__header">` +
          `<span class="progress__label">${ctx.esc(label)}</span>` +
          `<span class="progress__value">${Math.round(pct)}%</span></div>`
        : ''

      return (
        `<div class="progress progress--${ctx.esc(role)}"${colorStyle ? ` style="${colorStyle}"` : ''}>` +
        `${labelHtml}` +
        `<div class="progress__track">` +
        `<div class="progress__fill" style="width:${pct.toFixed(1)}%" ` +
        `role="progressbar" aria-valuenow="${value}" aria-valuemax="${max}"></div>` +
        `</div></div>`
      )
    },
  },
}
