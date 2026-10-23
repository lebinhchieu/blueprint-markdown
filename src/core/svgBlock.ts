/**
 * svgBlock.ts — the one place that turns an SVG source string into HTML.
 *
 * Used by the ```svg fence (fence.ts) and the :::svg directive (directives/svg.ts).
 * Nothing else may emit svg markup into HTML: the output of sanitizeSvg() is the only
 * svg text that ever reaches the page, and it goes through here.
 *
 * Markup contract: ui-design/03.md section 1 (figure) and section 3 (error callout).
 */

import { sanitizeSvg, SVG_MAX_BYTES, type SvgError } from './svgSanitize'

export interface SvgBlockOpts {
  /** Plain text: title bar + accessible name. Directive only. */
  title?: string
  /** Inline markdown, rendered with `renderInline`. Directive only. */
  caption?: string
  /** Raw `width=` attr; only ^\d{1,4}(px|%)?$ is honoured. */
  width?: string
  /** Present-mode cue id → data-cue on the outer element. */
  cue?: string
}

/**
 * Scope is a hash of the source, so the same drawing twice in one document would share
 * ids (`url(#g)` resolves to the first, possibly hidden, copy). The n-th repeat of a source
 * in a render is sanitized with salt n (first occurrence: salt 0, unchanged output).
 * Module state, not markdown-it env: nested directive text renders with a fresh private-md
 * env. Reset at the start of every outer render (markdownItPlugin, exportHtml) so the
 * output stays deterministic: same doc -> same bytes.
 */
const occurrences = new Map<string, number>()
export function resetSvgOccurrences(): void {
  occurrences.clear()
}

const DEFAULT_LABEL = 'SVG drawing'
const EXCERPT_LINES = 6
const EXCERPT_COLS = 120

/** Validated inline width style, or '' when absent/invalid (D8). */
function widthStyle(width?: string): string {
  const m = width?.trim().match(/^(\d{1,4})(px|%)?$/)
  return m ? ` style="width:${m[1]}${m[2] ?? 'px'}"` : ''
}

/** First lines of the offending source, each cut, for the error callout. */
function excerpt(src: string): string {
  return src
    .replace(/^\s*\n/, '')
    .split('\n')
    .slice(0, EXCERPT_LINES)
    .map(l => (l.length > EXCERPT_COLS ? l.slice(0, EXCERPT_COLS) + '…' : l))
    .join('\n')
}

function errorCopy(err: SvgError, esc: (s: string) => string): { reason: string; hint: string; showSrc: boolean } {
  switch (err.kind) {
    case 'empty':
      return { reason: 'The SVG block is empty.', hint: 'Put an &lt;svg&gt;…&lt;/svg&gt; element inside the block.', showSrc: false }
    case 'not-svg': {
      const found = err.tag ? `found &lt;${esc(err.tag.slice(0, 20))}&gt;` : 'none found'
      return {
        reason: `The block must start with an &lt;svg&gt; element, ${found}.`,
        hint: 'Remove everything outside the &lt;svg&gt; element.',
        showSrc: true,
      }
    }
    case 'malformed':
      return {
        reason: 'The SVG markup is not valid.',
        hint: 'Check for an unclosed tag, or a bare &lt; or &amp; inside text (write &amp;lt; and &amp;amp;).',
        showSrc: true,
      }
    case 'nothing-to-draw':
      return { reason: 'The SVG has nothing to draw.', hint: 'Add shapes or text inside the &lt;svg&gt; element.', showSrc: false }
    case 'too-complex':
      return { reason: 'The SVG is too complex to draw.', hint: 'Reduce the number of elements or the nesting depth.', showSrc: false }
    case 'too-large':
      return {
        reason: `The SVG is too large to draw (${Math.floor(Number(err.kb))} KB, limit ${SVG_MAX_BYTES / 1024} KB).`,
        hint: 'Simplify the drawing or reduce path precision.',
        showSrc: false,
      }
  }
}

export function renderSvgError(src: string, err: SvgError, esc: (s: string) => string, cue: string): string {
  const { reason, hint, showSrc } = errorCopy(err, esc)
  const srcHtml = showSrc && src.trim() ? `<pre class="em-svg-error__src"><code>${esc(excerpt(src))}</code></pre>` : ''
  return (
    `<div class="callout callout--danger em-svg-error"${cue}>` +
    `<div class="callout__header"><span class="material-symbols-outlined callout__icon">error</span>` +
    `<span class="callout__title">Can't draw this SVG</span></div>` +
    `<div class="callout__body"><p>${reason}</p><p>${hint}</p>${srcHtml}</div></div>`
  )
}

/**
 * Sanitize `src` and wrap it in the figure markup, or return the error callout.
 * `esc` escapes text; `renderInline` renders the caption (falls back to esc).
 */
export function renderSvgBlock(
  src: string,
  opts: SvgBlockOpts,
  esc: (s: string) => string,
  renderInline?: (md: string) => string,
): string {
  const cue = opts.cue ? ` data-cue="${esc(opts.cue)}"` : ''
  const key = src.trim()
  const n = occurrences.get(key) ?? 0
  occurrences.set(key, n + 1)
  const res = sanitizeSvg(src, n)
  if (!res.ok) return renderSvgError(src, res.error, esc, cue)

  const title = opts.title?.trim()
  const caption = opts.caption?.trim()
  const label = esc(title || DEFAULT_LABEL)

  const titleBar = title
    ? `<div class="em-svg__title"><span class="material-symbols-outlined">image</span>${esc(title)}</div>`
    : ''
  const captionHtml = caption
    ? `<figcaption class="em-svg__caption">${renderInline ? renderInline(caption) : esc(caption)}</figcaption>`
    : ''

  return (
    `<figure class="em-svg"${widthStyle(opts.width)}${cue}>` +
    `<div class="em-svg__frame">${titleBar}` +
    `<div class="em-svg__canvas ${res.scope}" role="img" aria-label="${label}">${res.html}</div>` +
    `</div>${captionHtml}</figure>\n`
  )
}
