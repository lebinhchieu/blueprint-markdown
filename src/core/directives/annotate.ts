/**
 * annotate.ts — numbered markers linking material to margin notes.
 *
 * One primitive, three hosts. A marker number `n` appears on the material and on its
 * note; hovering or clicking either lights both (markers.ts).
 *
 *   Code line   ```js start=40 marks="3:1 7:2"      (fence.ts)
 *   Image       :::pins  ![shot](a.png)  ::pin{x=30 y=20 n=1}  :::
 *   Phrase      :marker[exact words]{n=1}
 *
 * The note side:
 *
 *   :::annotated
 *   …material (fence, :::pins, prose)…
 *   :::marker{n=1 title="Why it matters"}
 *   Note text.
 *   :::
 *   :::
 *
 * On a wide screen the notes sit in a column beside the material, level with the
 * marker they explain; narrow screens stack them under it.
 */

import type { DirectiveNode, DirectiveSpec } from '../types'

/** Marker numbers are short digit strings; anything else is rejected. */
function markerNumber(node: DirectiveNode): string | undefined {
  const raw = node.attrs.named['n'] ?? node.attrs.primary
  return raw && /^\d{1,3}$/.test(raw) ? raw : undefined
}

/** Percentage coordinate for a pin: 0–100, up to two decimals. */
function pct(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return undefined
  const v = parseFloat(raw)
  return v >= 0 && v <= 100 ? v : undefined
}

const isMarker = (c: DirectiveNode | { type: 'text' }): c is DirectiveNode =>
  c.type === 'directive' && c.name === 'marker' && c.form === 'container'

export const annotateDirectives: Record<string, DirectiveSpec> = {
  annotated: {
    forms: ['container'],
    render(node, ctx) {
      const children = node.children ?? []
      const notes = children.filter(isMarker)
      const main  = children.filter(c => !isMarker(c))
      const mainHtml  = ctx.renderChildren({ ...node, children: main })
      const notesHtml = ctx.renderChildren({ ...node, children: notes })
      return (
        `<div class="annot">` +
        `<div class="annot__main">${mainHtml}</div>` +
        `<div class="annot__notes">${notesHtml}</div>` +
        `</div>`
      )
    },
  },

  // Container form = the note; inline form = a phrase tagged with the same number.
  marker: {
    forms: ['container', 'inline'],
    render(node, ctx) {
      const n = markerNumber(node)
      if (node.form === 'inline') {
        const text = ctx.renderInline(node.text ?? '')
        return n
          ? `<span class="mk-ref" data-mk="${n}">${text}</span>`
          : `<span class="mk-ref">${text}</span>`
      }

      const title = node.attrs.named['title']
      const titleHtml = title ? `<div class="marker__title">${ctx.renderInline(title)}</div>` : ''
      const nAttr = n ? ` data-mk="${n}"` : ''
      return (
        `<aside class="marker"${nAttr}>` +
        `<div class="marker__body">${titleHtml}${ctx.renderChildren(node)}</div>` +
        `</aside>`
      )
    },
  },

  // A positioned-pins frame around an image: pins use % of the image box, so they
  // stay on the right pixel at any rendered width.
  pins: {
    forms: ['container'],
    render(node, ctx) {
      return `<div class="pins">${ctx.renderChildren(node)}</div>`
    },
  },

  // ::pin{x=30 y=20 n=1}  — a point.  ::pin{x=10 y=60 w=25 h=12 n=2}  — an outlined region.
  pin: {
    forms: ['leaf'],
    render(node, ctx) {
      const n = markerNumber(node)
      const x = pct(node.attrs.named['x'])
      const y = pct(node.attrs.named['y'])
      if (x === undefined || y === undefined) {
        return `<!-- pin needs x and y between 0 and 100 -->`
      }
      const w = pct(node.attrs.named['w'])
      const h = pct(node.attrs.named['h'])
      const box = w !== undefined && h !== undefined
      const style = `left:${x}%;top:${y}%` + (box ? `;width:${w}%;height:${h}%` : '')
      const label = node.attrs.named['label']
      const title = label ? ` title="${ctx.esc(label)}"` : ''
      const nAttr = n ? ` data-mk="${n}"` : ''
      return `<span class="pin${box ? ' pin--box' : ''}"${nAttr} style="${style}"${title}></span>`
    },
  },
}
