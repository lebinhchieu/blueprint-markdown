/**
 * extension.ts — VS Code extension entry point.
 *
 * Returns { extendMarkdownIt } which VS Code calls once when the
 * built-in Markdown preview first opens.  All heavy lifting is in
 * markdownItPlugin.ts.
 *
 * Also registers listeners so that changing blueprintMarkdown.theme
 * (or VS Code's own active theme when set to "auto") forces the preview
 * to re-render via the public markdown.preview.refresh command.
 */

import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { installEnhancedMarkdown } from './markdownItPlugin'
import { exportToHtml } from './export/exportHtml'

export function activate(context: vscode.ExtensionContext) {
  const refresh = () =>
    vscode.commands.executeCommand('markdown.preview.refresh')

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprintMarkdown.exportHtml', () => exportToHtml(context)),
  )

  // Re-render when the user changes the theme setting.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('blueprintMarkdown.theme')) {
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
