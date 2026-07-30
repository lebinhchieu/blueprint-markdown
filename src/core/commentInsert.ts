/**
 * commentInsert.ts — preview-only right-click "Add Comment" / "Edit Comment" bridge.
 *
 * The built-in markdown preview webview never sets `enableCommandUris`, so `command:`
 * links are silently dropped — there is no message channel a contributed previewScript
 * can open on its own (VS Code core's own preview script already claims the single
 * `acquireVsCodeApi()` call). The documented bridge for webview content instead is
 * `data-vscode-context`: VS Code's webview host reads this JSON blob off the nearest
 * ancestor of a right-clicked (or, for keybindings, focused) element and forwards it as
 * the command's argument via `contributes.menus["webview/context"]` (see package.json)
 * or any keybinding the user assigns to `blueprintMarkdown.addComment`/`.editComment`
 * themselves (e.g. via the Keyboard Shortcuts editor, scoped with `"when": "emCommentTarget"`
 * / `"when": "emCommentEdit"`).
 *
 * Tracked on `selectionchange` (not `contextmenu`) rather than only computed lazily when
 * the menu opens, so the context is already live and correct the moment a user-assigned
 * keybinding fires — it never depends on where a right-click happened. A plain click (no
 * drag) still fires `selectionchange`, which is what lets "Edit Comment" work without the
 * user needing to select any text first — just click into the badge and right-click.
 *
 * Installed once at module load (this file is only ever imported for its side effect,
 * from src/preview.ts, never re-run) — a listener on `document` survives every morphdom
 * patch since `document`/`document.body` themselves are never replaced.
 */

// The source document's URI never changes for a given preview instance — read it once
// rather than re-parsing the meta tag on every selectionchange.
const settingsRaw = document.getElementById('vscode-markdown-preview-data')?.getAttribute('data-settings')
const sourceUri: string | undefined = settingsRaw ? JSON.parse(settingsRaw).source : undefined

/** Which occurrence `target` is among same-source directive wrappers in `block` — see the
 *  matching "Selected/anchor text can repeat" comment below for why this exists. */
function nthDirectiveOccurrence(block: HTMLElement, target: HTMLElement, source: string): number {
  const sameSource = Array.from(block.querySelectorAll<HTMLElement>('[data-em-source]')).filter(
    m => m.getAttribute('data-em-source') === source,
  )
  return sameSource.indexOf(target)
}

document.addEventListener('selectionchange', () => {
  if (!sourceUri) return

  const sel = window.getSelection()
  const anchorNode = sel?.anchorNode
  const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement

  // Clicking (or right-clicking) anywhere inside an existing `:comment` badge — offer
  // "Edit Comment" instead, regardless of whether anything is selected. Checked first so
  // it always wins over "Add Comment" when the two would otherwise both apply.
  const commentEl = anchorEl?.closest<HTMLElement>('.comment')
  if (commentEl) {
    const directiveEl = commentEl.closest<HTMLElement>('[data-em-source]')
    const block = commentEl.closest<HTMLElement>('[data-line]')
    const rawSource = directiveEl?.getAttribute('data-em-source')
    if (directiveEl && block && rawSource) {
      document.body.dataset.vscodeContext = JSON.stringify({
        emCommentEdit: true,
        uri: sourceUri,
        line: Number(block.getAttribute('data-line')),
        rawSource,
        nth: nthDirectiveOccurrence(block, directiveEl, rawSource),
        blockLength: block.textContent?.length ?? 0,
      })
    } else {
      delete document.body.dataset.vscodeContext
    }
    return
  }

  const range = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.getRangeAt(0) : null
  const container = range?.commonAncestorContainer
  const el = container instanceof Element ? container : container?.parentElement
  const block = el?.closest<HTMLElement>('[data-line]')

  // No selection or no locatable block — clear any stale context so the menu item doesn't show.
  // Fenced code blocks stamp data-line directly on their own <pre>/<code> wrapper (core's
  // renderer), so `block` itself *is* that element here — bail, since a comment inserted into
  // a fence would land in opaque, never-parsed code (see CLAUDE.md's fence description).
  if (!range || !block || block.closest('pre')) {
    delete document.body.dataset.vscodeContext
    return
  }

  // Any other inline directive (:chip[...], :kbd[...], :tooltip[...], etc.) is a descendant of
  // the block, not the block itself — but its *rendered* text doesn't roundtrip back to source
  // (`:chip[Active]{success}` renders as just "Active"), so searching for that text would let a
  // comment land inside the `[...]`, corrupting both directives. src/core/inline.ts wraps every
  // inline directive's output in a `[data-em-source]` span carrying its exact source text —
  // prefer that (checked first so it also wins over any `<code>` nested inside, e.g. inside a
  // :tooltip's rendered note) and use it verbatim as the anchor, no reconstruction needed.
  const directiveEl = el?.closest<HTMLElement>('[data-em-source]')

  // Inline code (`` `code` ``) not inside any directive has the same problem, but with a fixed,
  // mechanical source form — reconstruct it as backtick + text + backtick (see `inlineCode`
  // below) rather than needing its own source marker.
  const codeEl = directiveEl ? null : el?.closest<HTMLElement>('code')

  const anchorText = directiveEl
    ? directiveEl.getAttribute('data-em-source') ?? ''
    : codeEl
      ? codeEl.textContent ?? ''
      : range.toString()
  if (!anchorText) {
    delete document.body.dataset.vscodeContext
    return
  }

  // Selected/anchor text can repeat within the block (e.g. two "the"s in one sentence, two
  // identical inline code spans, or two identical directives) — figure out which occurrence
  // this is, so the extension host can pick the same one in the source instead of always the
  // first. For a directive, count by position among same-source `[data-em-source]` elements
  // directly (its rendered text may not be unique — e.g. two different chips both showing
  // "Active" — so text counting isn't reliable there); otherwise count occurrences of the
  // rendered text before this point, which is reliable for plain prose and inline code.
  let nth: number
  if (directiveEl) {
    nth = nthDirectiveOccurrence(block, directiveEl, anchorText)
  } else {
    const preRange = document.createRange()
    preRange.selectNodeContents(block)
    if (codeEl) {
      preRange.setEndBefore(codeEl)
    } else {
      preRange.setEnd(range.startContainer, range.startOffset)
    }
    nth = preRange.toString().split(anchorText).length - 1
  }

  document.body.dataset.vscodeContext = JSON.stringify({
    emCommentTarget: true,
    uri: sourceUri,
    line: Number(block.getAttribute('data-line')),
    selectedText: anchorText,
    inlineCode: !!codeEl,
    nth,
    blockLength: block.textContent?.length ?? 0,
  })
})
