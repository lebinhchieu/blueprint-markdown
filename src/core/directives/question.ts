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
      const hasRec = !!rec || (node.children ?? []).some(
        c => c.type === 'directive' && c.name === 'option' && hasFlag(c.attrs, 'rec'),
      )
      const accept = !hasRec ? '' :
        `<button type="button" class="question__accept" data-qa-accept title="Use the recommended answer">` +
        `Accept ➡️</button>`

      return (
        `<div class="question"${idAttr} data-qa-title="${ctx.esc(title)}"${recAttr}${multiAttr}>` +
        `<div class="question__head">${idChip}${titleHtml}${accept}</div>` +
        `<div class="question__body">${ctx.renderChildren(node)}</div>` +
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
      const recChip = rec ? `<span class="question__rec">➡️ recommended</span>` : ''
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
        `<span class="qa-copy__progress" data-qa-progress>0/0 answered</span>` +
        `<button type="button" class="qa-copy__btn" data-qa-copy>Copy answers</button>` +
        `</div>`
      )
    },
  },
}
