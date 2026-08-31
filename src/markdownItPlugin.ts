/**
 * markdownItPlugin.ts — thin vscode-facing wrapper around
 * src/core/installBlueprintMarkdown.ts (the actual engine, vscode-free so the
 * standalone CLI preview — src/export/buildHtml.ts — can share it without
 * pulling in `vscode`).
 *
 * This file's only job: resolve theme/toc/workspace-folders from VS Code's own
 * config and active editor state, and hand them to the shared engine as getters
 * (called fresh on every render, so a settings change picks up on the next
 * markdown.preview.refresh without needing to recreate the markdown-it instance).
 */

import * as vscode from 'vscode'
import type MarkdownIt from 'markdown-it'
import { installBlueprintMarkdownCore } from './core/installBlueprintMarkdown'

/**
 * Read blueprintMarkdown.theme from workspace config and resolve it to a
 * concrete 'light' or 'dark' value.  When set to 'auto', falls back to VS Code's
 * active color theme kind.  Called fresh on every render so changes are picked up
 * without restarting the extension.
 */
export function resolveTheme(): string {
  const setting = vscode.workspace
    .getConfiguration('blueprintMarkdown')
    .get<string>('theme', 'light')
  if (setting !== 'auto') return setting
  // 'auto' — follow VS Code's active color theme
  const kind = vscode.window.activeColorTheme.kind
  return (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast)
    ? 'dark'
    : 'light'
}

/** Read blueprintMarkdown.toc from workspace config: 'off' | 'h2' | 'h3'. */
export function resolveToc(): string {
  return vscode.workspace
    .getConfiguration('blueprintMarkdown')
    .get<string>('toc', 'h3')
}

export function installBlueprintMarkdown(md: MarkdownIt): MarkdownIt {
  return installBlueprintMarkdownCore(md, {
    getTheme: resolveTheme,
    getToc: resolveToc,
    getWorkspaceFolders: () => (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath),
  })
}
