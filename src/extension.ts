/**
 * extension.ts — VS Code extension entry point.
 *
 * Returns { extendMarkdownIt } which VS Code calls once when the
 * built-in Markdown preview first opens.  All heavy lifting is in
 * markdownItPlugin.ts.
 *
 * Also registers listeners so that changing blueprintMarkdown.theme or
 * blueprintMarkdown.mindmapHeight (or VS Code's own active theme when the
 * theme setting is "auto") forces the preview to re-render via the public
 * markdown.preview.refresh command.
 */

import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { installEnhancedMarkdown } from './markdownItPlugin'
import { exportToHtml } from './export/exportHtml'

interface AddCommentArg {
  uri?: string
  line?: number
  selectedText?: string
  inlineCode?: boolean
  nth?: number
  blockLength?: number
}

interface EditCommentArg {
  uri?: string
  line?: number
  rawSource?: string
  nth?: number
  blockLength?: number
}

/**
 * Right-click "Add Comment" in the preview (see src/core/commentInsert.ts) — inserts
 * `:comment[note]` right after the selected text in the source document.
 *
 * The source line is only the *start* of the block the selection landed in (see
 * markdownItPlugin.ts's data-line stamping), so this searches forward from that line's
 * start offset rather than trusting it as an exact line. The search is whitespace-flexible
 * because a rendered selection collapses a soft-wrapped source line break to a single space.
 * When the phrase repeats nearby, `arg.nth` (which occurrence within the block) picks the
 * right one instead of erroring or always taking the first.
 *
 * `arg.inlineCode` means the selection landed inside an inline code span — inline code is
 * opaque to the directive parser (src/core/inline.ts runs before markdown-it's backtick rule,
 * which still swallows its whole span as one token), so `arg.selectedText` there is the code
 * span's full text and the match must be widened to its surrounding backticks so the comment
 * lands right after the closing backtick, not inside the span.
 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Runs `pattern` (global) forward from `fromOffset`, taking the `nth` match found before
 * `windowEnd` — shared by addComment/editComment, both of which need to pick the same
 * occurrence in the source that the preview identified in the render (see commentInsert.ts's
 * "Selected/anchor text can repeat" comment for why `nth` exists at all). Falls back to the
 * last match found if the source has fewer matches than the render implied (rare — e.g. an
 * occurrence hidden in markdown syntax that doesn't render as visible text) instead of erroring.
 */
function findNthMatch(text: string, pattern: RegExp, fromOffset: number, windowEnd: number, nth: number): RegExpExecArray | null {
  pattern.lastIndex = fromOffset
  let match: RegExpExecArray | null = null
  for (let i = 0; i <= nth; i++) {
    const next = pattern.exec(text)
    if (!next || next.index > windowEnd) break
    match = next
  }
  return match
}

/** ponytail: rendered length is a proxy for the source span's length, padded generously for
 *  markdown syntax overhead (**bold**, links, etc). Upgrade to an exact next-data-line bound
 *  if this padding heuristic misfires in practice. */
const searchWindowEnd = (fromOffset: number, blockLength?: number) => fromOffset + Math.max((blockLength ?? 0) * 4, 200)

async function addComment(arg: AddCommentArg): Promise<void> {
  if (!arg?.uri || !arg.selectedText) return

  const note = await vscode.window.showInputBox({
    prompt: 'Comment note',
    placeHolder: 'Add a note…',
    validateInput: v => (v.includes(']') ? 'Note text cannot contain "]"' : undefined),
  })
  if (!note) return // Escape or empty input — no-op

  const uri = vscode.Uri.parse(arg.uri)
  const document = await vscode.workspace.openTextDocument(uri)
  const line = Math.min(Math.max(arg.line ?? 0, 0), document.lineCount - 1)
  const fromOffset = document.offsetAt(new vscode.Position(line, 0))
  const text = document.getText()

  const body = arg.selectedText.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
  const pattern = arg.inlineCode ? '`' + body + '`' : body
  const re = new RegExp(pattern, 'g')
  const windowEnd = searchWindowEnd(fromOffset, arg.blockLength)
  const match = findNthMatch(text, re, fromOffset, windowEnd, arg.nth ?? 0)
  if (!match) {
    vscode.window.showWarningMessage(
      'Blueprint Markdown: could not locate the selected text — comment not inserted.',
    )
    return
  }

  const insertAt = document.positionAt(match.index + match[0].length)
  const edit = new vscode.WorkspaceEdit()
  edit.insert(uri, insertAt, ` :comment[${note}]`)
  await vscode.workspace.applyEdit(edit)
}

/**
 * Right-click "Edit Comment" in the preview (see src/core/commentInsert.ts) — lets a user
 * change just the note text of an existing `:comment[...]` without retyping its `{attrs}`.
 *
 * `arg.rawSource` is the directive's exact original source text (e.g.
 * `:comment[Old note]{author="Alice"}`), read straight off the `data-em-source` marker
 * src/core/inline.ts stamps on every inline directive — so, unlike addComment, there's no
 * whitespace-flexible reconstruction needed: the regex search is a literal match on that
 * verbatim string, anchored the same way (from the block's line offset, disambiguated by
 * `arg.nth` when the same directive text repeats nearby).
 */
async function editComment(arg: EditCommentArg): Promise<void> {
  if (!arg?.uri || !arg.rawSource) return

  const parsed = arg.rawSource.match(/^:comment\[([\s\S]*)\](\{[\s\S]*\})?$/)
  if (!parsed) return // rawSource always comes from a rendered :comment directive
  const [, currentNote, attrsPart = ''] = parsed

  const note = await vscode.window.showInputBox({
    prompt: 'Edit comment note',
    value: currentNote,
    validateInput: v => (v.includes(']') ? 'Note text cannot contain "]"' : undefined),
  })
  if (note === undefined || note === currentNote) return // Escape, or unchanged — no-op

  const uri = vscode.Uri.parse(arg.uri)
  const document = await vscode.workspace.openTextDocument(uri)
  const line = Math.min(Math.max(arg.line ?? 0, 0), document.lineCount - 1)
  const fromOffset = document.offsetAt(new vscode.Position(line, 0))
  const text = document.getText()

  const re = new RegExp(escapeRegExp(arg.rawSource), 'g')
  const windowEnd = searchWindowEnd(fromOffset, arg.blockLength)
  const match = findNthMatch(text, re, fromOffset, windowEnd, arg.nth ?? 0)
  if (!match) {
    vscode.window.showWarningMessage(
      'Blueprint Markdown: could not locate that comment — it may have changed.',
    )
    return
  }

  const range = new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length))
  const edit = new vscode.WorkspaceEdit()
  edit.replace(uri, range, `:comment[${note}]${attrsPart}`)
  await vscode.workspace.applyEdit(edit)
}

export function activate(context: vscode.ExtensionContext) {
  const refresh = () =>
    vscode.commands.executeCommand('markdown.preview.refresh')

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.exportHtml', () => exportToHtml(context)),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.addComment', addComment),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.editComment', editComment),
  )

  // Re-render when the user changes the theme or mindmap height setting.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('blueprintMarkdown.theme') ||
        e.affectsConfiguration('blueprintMarkdown.mindmapHeight') ||
        e.affectsConfiguration('blueprintMarkdown.toc')
      ) {
        refresh()
      }
    }),
  )

  // Re-render when VS Code's own theme changes — only relevant when set to "auto".
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      const setting = vscode.workspace
        .getConfiguration('blueprintMarkdown')
        .get<string>('theme', 'light')
      if (setting === 'auto') {
        refresh()
      }
    }),
  )

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return installEnhancedMarkdown(md)
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
