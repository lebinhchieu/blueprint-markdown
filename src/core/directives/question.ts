/**
 * question.ts — :::question, :::option and :::qa-copy directives (grilling Q&A).
 *
 * :::question{id="r1-q1" title="Storage backend" rec="SQLite"}
 *   Question body markdown.
 *   :::option{title="SQLite" rec}
 *     Rich markdown: code, images, mermaid, callouts…
 *   :::
 *   :::option{title="Postgres"}
 *     …
 *   :::
 * :::
 *
 * :::qa-copy
 * :::
 *
 * Answers are NOT stored in the source. They live in localStorage and are
 * wired by qa.ts (delegated listeners + restore after each morphdom pass).
 * `multi` makes the options checkboxes; default is single choice. `rec` on an
 * option marks it recommended; `rec="text"` on a question is the recommended
 * free-text answer when there are no options.
 */

import type { DirectiveSpec, Attrs } from '../types'

const svg = (d: string): string =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
const ICON = {
  check: svg('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'),
  star: svg('M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'),
  copy: svg('M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'),
}

/** First bare word lands in `primary`, later ones in `flags` — accept either. */
function hasFlag(attrs: Attrs, name: string): boolean {
  return attrs.primary === name || attrs.flags.has(name)
}

export const questionDirectives: Record<string, DirectiveSpec> = {
  question: {
    forms: ['container'],
    render(node, ctx) {
      const id    = node.attrs.named['id'] ?? ''
      const title = node.attrs.named['title'] ?? ''
      const rec   = node.attrs.named['rec'] ?? ''
      const multi = hasFlag(node.attrs, 'multi')
      const hasOptions = (node.children ?? []).some(c => c.type === 'directive' && c.name === 'option')

      const idAttr = id ? ` data-qa-id="${ctx.esc(id)}"` : ''
      const recAttr = rec ? ` data-qa-rec="${ctx.esc(rec)}"` : ''
      const multiAttr = multi ? ' data-qa-multi' : ''

      const idChip = id ? `<span class="question__id">${ctx.esc(id)}</span>` : ''
      const titleHtml = title ? `<span class="question__title">${ctx.renderInline(title)}</span>` : ''
      const recOpts = (node.children ?? []).filter(
        c => c.type === 'directive' && c.name === 'option' && hasFlag(c.attrs, 'rec'),
      )
      const hasRec = !!rec || recOpts.length > 0
      const recWhat = hasOptions
        ? recOpts.map(c => c.attrs.named['title'] ?? '').filter(Boolean).join(', ')
        : rec
      const accept = !hasRec ? '' :
        `<button type="button" class="question__accept" data-qa-accept aria-pressed="false" ` +
        `title="Use the recommended answer${recWhat ? `: ${ctx.esc(recWhat)}` : ''}">${ICON.check}` +
        `<span class="l-idle">Accept</span><span class="l-done">Accepted</span><span class="l-undo">Undo</span></button>`
      const recLine = rec && !hasOptions
        ? `<div class="question__recline">${ICON.star}<span>Rec:</span> <b>${ctx.esc(rec)}</b></div>`
        : ''

      return (
        `<div class="question"${idAttr} data-qa-title="${ctx.esc(title)}"${recAttr}${multiAttr}>` +
        `<div class="question__head"><span class="question__state" aria-hidden="true">${ICON.check}</span>${idChip}${titleHtml}${accept}</div>` +
        `<div class="question__body">${ctx.renderChildren(node)}</div>` +
        recLine +
        `<textarea class="question__note" data-qa-note rows="1" aria-label="Notes / other" ` +
        `placeholder="${hasOptions ? 'Notes / other…' : 'Your answer…'}"></textarea>` +
        `</div>`
      )
    },
  },

  // Selectable choice inside :::question. Standalone it just renders its body.
  option: {
    forms: ['container'],
    render(node, ctx) {
      const id    = node.attrs.named['id'] ?? ''
      const title = node.attrs.named['title'] ?? ''
      const rec   = hasFlag(node.attrs, 'rec')

      const idAttr = id ? ` data-qa-opt="${ctx.esc(id)}"` : ''
      const recAttr = rec ? ' data-qa-rec' : ''
      const recChip = rec ? `<span class="question__rec">${ICON.star}Rec</span>` : ''
      const bodyHtml = ctx.renderChildren(node)
      const body = bodyHtml.trim() ? `<div class="question__opt-body">${bodyHtml}</div>` : ''

      return (
        `<div class="question__option"${idAttr} data-qa-title="${ctx.esc(title)}"${recAttr}>` +
        `<button type="button" class="question__pick" data-qa-pick aria-pressed="false" title="Click to select; click again to clear">` +
        `<span class="question__mark" aria-hidden="true"></span>` +
        `<span class="question__opt-title">${ctx.renderInline(title)}</span>${recChip}</button>` +
        body +
        `</div>`
      )
    },
  },

  'qa-copy': {
    forms: ['container'],
    render() {
      return (
        `<div class="qa-copy">` +
        `<div class="qa-copy__segs" role="group" aria-label="Question progress" data-qa-segs></div>` +
        `<span class="qa-copy__progress" data-qa-progress>0/0</span>` +
        `<button type="button" class="qa-copy__btn" data-qa-copy>${ICON.copy}` +
        `<span class="l-idle">Copy answers</span><span class="l-done">Copied</span></button>` +
        `</div>`
      )
    },
  },
}
