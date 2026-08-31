/**
 * extension.ts — VS Code extension entry point.
 *
 * Returns { extendMarkdownIt } which VS Code calls once when the
 * built-in Markdown preview first opens.  All heavy lifting is in
 * markdownItPlugin.ts.
 *
 * Also registers listeners so that changing blueprintMarkdown.theme
 * (or VS Code's own active theme when the theme setting is "auto") forces
 * the preview to re-render via the public markdown.preview.refresh command.
 */

import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { installBlueprintMarkdown } from './markdownItPlugin'
import { exportToHtml } from './export/exportHtml'
import { findInsertOffset, findReplaceRange } from './core/commentEdit'

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
 * Right-click "Add Comment" / "Add AI Comment" in the preview (see
 * src/core/commentInsert.ts) — inserts `:comment[note]` or `:ai[note]` right after the
 * selected text in the source document. Both commands call this with a different
 * `directiveName` (see registerCommand calls in `activate` below) — same insertion logic,
 * just a different directive name and input-box copy.
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
 *
 * The actual text-matching logic lives in src/core/commentEdit.ts (vscode-free, shared with
 * the standalone CLI preview) — this function is just the VS Code shell around it: prompt,
 * open the document, apply the resulting edit.
 */
async function addComment(arg: AddCommentArg, directiveName: 'comment' | 'ai' = 'comment'): Promise<void> {
  const selectedText = arg?.selectedText
  if (!arg?.uri || !selectedText) return

  const note = await vscode.window.showInputBox({
    prompt: directiveName === 'ai' ? 'AI comment note' : 'Comment note',
    placeHolder: directiveName === 'ai' ? 'Add a note for the AI…' : 'Add a note…',
    validateInput: v => (v.includes(']') ? 'Note text cannot contain "]"' : undefined),
  })
  if (!note) return // Escape or empty input — no-op

  const uri = vscode.Uri.parse(arg.uri)
  const document = await vscode.workspace.openTextDocument(uri)
  const text = document.getText()

  const insertOffset = findInsertOffset(text, arg.line ?? 0, {
    selectedText,
    inlineCode: arg.inlineCode,
    nth: arg.nth,
    blockLength: arg.blockLength,
  })
  if (insertOffset === null) {
    vscode.window.showWarningMessage(
      'Blueprint Markdown: could not locate the selected text — comment not inserted.',
    )
    return
  }

  const edit = new vscode.WorkspaceEdit()
  edit.insert(uri, document.positionAt(insertOffset), ` :${directiveName}[${note}]`)
  await vscode.workspace.applyEdit(edit)
}

/**
 * Right-click "Edit Comment" in the preview (see src/core/commentInsert.ts) — lets a user
 * change just the note text of an existing `:comment[...]`/`:ai[...]` without retyping its
 * `{attrs}`.
 *
 * `arg.rawSource` is the directive's exact original source text (e.g.
 * `:comment[Old note]{author="Alice"}`), read straight off the `data-em-source` marker
 * src/core/inline.ts stamps on every inline directive — so, unlike addComment, there's no
 * whitespace-flexible reconstruction needed: the regex search is a literal match on that
 * verbatim string, anchored the same way (from the block's line offset, disambiguated by
 * `arg.nth` when the same directive text repeats nearby).
 *
 * `:ai` renders with the same `.comment` class as `:comment` (see inline-widgets.ts's
 * `makeCommentSpec`), so commentInsert.ts's `.closest('.comment')` check — and therefore this
 * command — fires for either directive. The directive name is captured rather than hardcoded
 * so an `:ai[...]` badge gets rewritten back to `:ai[...]`, not silently dropped or rewritten
 * to `:comment[...]`.
 */
async function editComment(arg: EditCommentArg): Promise<void> {
  const rawSource = arg?.rawSource
  if (!arg?.uri || !rawSource) return

  const uri = vscode.Uri.parse(arg.uri)
  const document = await vscode.workspace.openTextDocument(uri)
  const text = document.getText()

  const target = findReplaceRange(text, arg.line ?? 0, {
    rawSource,
    nth: arg.nth,
    blockLength: arg.blockLength,
  })
  if (!target) {
    // rawSource failing to parse as a comment directive "never happens in practice" (it always
    // comes from a rendered :comment/:ai directive) — the realistic case here is the text moved
    // out of the search window since the click.
    vscode.window.showWarningMessage(
      'Blueprint Markdown: could not locate that comment — it may have changed.',
    )
    return
  }

  const note = await vscode.window.showInputBox({
    prompt: 'Edit comment note',
    value: target.currentNote,
    validateInput: v => (v.includes(']') ? 'Note text cannot contain "]"' : undefined),
  })
  if (note === undefined || note === target.currentNote) return // Escape, or unchanged — no-op

  const range = new vscode.Range(document.positionAt(target.start), document.positionAt(target.end))
  const edit = new vscode.WorkspaceEdit()
  edit.replace(uri, range, `:${target.directiveName}[${note}]${target.attrsPart}`)
  await vscode.workspace.applyEdit(edit)
}

/**
 * Ctrl+1..Ctrl+6 (see "keybindings" in package.json) — sets the current line(s) to an ATX
 * heading of the given level, replacing any existing `#`-marker rather than toggling it off.
 * `Set` of line numbers dedupes multi-cursor selections that land on the same line.
 */
async function setHeadingLevel(level: number): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  await editor.edit(editBuilder => {
    const lineNumbers = new Set(editor.selections.map(s => s.active.line))
    for (const lineNum of lineNumbers) {
      const line = editor.document.lineAt(lineNum)
      const text = line.text.replace(/^ {0,3}#{1,6}\s+/, '')
      editBuilder.replace(line.range, `${'#'.repeat(level)} ${text}`)
    }
  })
}

export function activate(context: vscode.ExtensionContext) {
  const refresh = () =>
    vscode.commands.executeCommand('markdown.preview.refresh')

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.exportHtml', () => exportToHtml(context)),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.addComment', (arg: AddCommentArg) => addComment(arg, 'comment')),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.addAiComment', (arg: AddCommentArg) => addComment(arg, 'ai')),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.editComment', editComment),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.setHeadingLevel', (arg: { level: number }) => setHeadingLevel(arg.level)),
  )

  // Clicking a file ref in the preview that didn't resolve on disk (see inline-code.ts's
  // FIND_URI) — open VS Code's own file search with it prefilled instead of erroring on a
  // path we had to guess. Quick Open reads a trailing `:line` as a line target itself.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path !== '/find') return
        const query = new URLSearchParams(uri.query).get('q')
        if (query) vscode.commands.executeCommand('workbench.action.quickOpen', query)
      },
    }),
  )

  // Re-render when the user changes the theme or toc setting.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('blueprintMarkdown.theme') ||
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
      return installBlueprintMarkdown(md)
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
