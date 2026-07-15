/**
 * colors.ts — Shared color palette and token resolver.
 *
 * Maps named semantic tokens to CSS custom properties.
 * Raw hex values pass through unchanged.
 * Used by callout, chip, timeline, progress, button, color, etc.
 */

/** The canonical token → CSS variable mapping. */
export const COLOR_TOKENS: Record<string, string> = {
  primary: 'var(--c-primary)',
  success: 'var(--c-success)',
  green:   'var(--c-success)',
  warning: 'var(--c-warning)',
  amber:   'var(--c-warning)',
  danger:  'var(--c-danger)',
  red:     'var(--c-danger)',
  info:    'var(--c-info)',
  blue:    'var(--c-info)',
  gray:    'var(--c-gray)',
  low:     'var(--c-low)',
  yellow:  'var(--c-low)',
}

/** Alias map for token → semantic name (used for CSS class generation). */
export const COLOR_ALIASES: Record<string, string> = {
  green: 'success',
  amber: 'warning',
  red:   'danger',
  blue:   'info',
  yellow: 'low',
}

/**
 * Resolve a color token or hex string to a CSS value.
 * Returns undefined if the token is falsy/unknown and no fallback is given.
 *
 * @example
 *   resolveColor('primary')  → 'var(--c-primary)'
 *   resolveColor('red')      → 'var(--c-danger)'
 *   resolveColor('#0a7')     → '#0a7'
 *   resolveColor('unknown')  → undefined
 */
export function resolveColor(token?: string, customPalette?: Record<string, string>): string | undefined {
  if (!token) return undefined
  if (customPalette?.[token]) return customPalette[token]
  if (COLOR_TOKENS[token]) return COLOR_TOKENS[token]
  if (/^#[0-9a-fA-F]{3,8}$/.test(token)) return token
  return undefined
}

/**
 * Return the canonical semantic name for a color token.
 * e.g. 'green' → 'success', 'red' → 'danger', 'primary' → 'primary'
 */
export function canonicalRole(token?: string): string {
  if (!token) return 'gray'
  return COLOR_ALIASES[token] ?? token
}

/** #rgb or #rrggbb only — not the 4/8-digit alpha forms accepted by resolveColor(). */
export const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/

/** Small inline swatch showing the literal color. `hex` must already be regex-validated. */
export function hexSwatchHtml(hex: string): string {
  return `<span class="hex-swatch" style="background:${hex}" title="${hex}"></span>`
}
