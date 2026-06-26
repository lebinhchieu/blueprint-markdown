import type { DirectiveSpec, DirectiveNode } from '../types'

export const revisionDirectives: Record<string, DirectiveSpec> = {
  revision: {
    forms: ['container'],
    render(node, ctx) {
      const note = node.attrs.named['note']
      const date = node.attrs.named['date']

      // Separate the :::previous child from the current content
      const prevNode = (node.children ?? []).find(
        (c): c is DirectiveNode => c.type === 'directive' && c.name === 'previous',
      )
      const currentChildren = node.children?.filter(c => c !== prevNode)
      const currentHtml = ctx.renderChildren({ ...node, children: currentChildren })

      // Tooltip content: note + optional date
      const hintNoteHtml = note
        ? `<span class="revision__hint-note">${ctx.renderInline(note)}</span>`
        : ''
      const hintDateHtml = date
        ? `<span class="revision__hint-date">${ctx.esc(date)}</span>`
        : ''

      // Only add data-has-prev when a :::previous child exists (enables click + pointer cursor)
      const hasPrev = prevNode ? ' data-has-prev' : ''
      const ariaLabel = note ? ctx.esc(note) : 'View previous version'

      // Only render the hover hint when there is something to show
      const hintHtml = (note || date)
        ? `<span class="revision__hint" role="tooltip">${hintNoteHtml}${hintDateHtml}</span>`
        : ''

      // Previous-version floating panel — only rendered when :::previous exists
      const panelHtml = prevNode
        ? `<div class="revision__panel" hidden>` +
          `<div class="revision__panel-body">${ctx.renderChildren(prevNode)}</div>` +
          `</div>`
        : ''

      return (
        `<div class="revision"${hasPrev}>` +
        // Gutter marker (absolute-positioned, never affects flow)
        `<button type="button" class="revision__marker" aria-label="${ariaLabel}" aria-expanded="false">` +
        hintHtml +
        `</button>` +
        // Current content — rendered directly, no wrapper padding/border
        currentHtml +
        // Hidden panel (shown by JS on click)
        panelHtml +
        `</div>`
      )
    },
  },

  // Passthrough so a stray :::previous outside a :::revision still renders its content.
  previous: {
    forms: ['container'],
    render(node, ctx) {
      return ctx.renderChildren(node)
    },
  },
}
