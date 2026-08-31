# Blueprint Markdown

> Stop generating heavy HTML artifacts. Let AI write compact `:::` directives — then read and verify the output in a beautiful themed preview.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ChieuLe.blueprint-markdown-chieu?label=VS%20Code%20Marketplace&color=007ACC&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=ChieuLe.blueprint-markdown-chieu)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/ChieuLe.blueprint-markdown-chieu?color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ChieuLe.blueprint-markdown-chieu)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/ChieuLe.blueprint-markdown-chieu?color=007ACC)](https://marketplace.visualstudio.com/items?itemName=ChieuLe.blueprint-markdown-chieu)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Preview](media/readme/preview.png)

---

## Why Blueprint Markdown?

When you ask an AI to produce rich documentation, reports, or plans, the usual answer is
an **HTML artifact** — a self-contained blob of HTML, CSS, and JavaScript.

That works, but it has real costs:

| | HTML artifact | Blueprint Markdown |
|---|---|---|
| **Output size** | Large — full HTML/CSS/JS boilerplate every time | Small — just plain `:::` markdown directives |
| **Token cost** | High — generates and returns thousands of extra tokens | Low — directives are a fraction of equivalent HTML |
| **Generation speed** | Slow — model writes verbose markup | Fast — compact syntax, less to produce |
| **Reading / verifying** | Hard — raw HTML obscures the actual content | Easy — directives read like plain text |
| **Theming** | Static, embedded styles | 10 live themes; switch instantly |

Blueprint Markdown is two complementary pieces:

- **The Skill** — a Claude Code skill that teaches Claude to write `:::` directives instead of HTML artifacts. Auto-triggers on rich-markdown requests.
- **The Extension** — a VS Code Markdown preview renderer that turns those directives into beautiful, themed output.

---

## How It Works

![How It Works](media/readme/howitworks.png)

No extra commands. No HTML to wade through. The directives are human-readable
even in the raw `.md` file.

---

## Quickstart

Five steps from zero to a beautiful themed preview:

1. **Install the skill** — paste this into your AI agent (Claude Code, Cursor, Copilot, etc.):

   ```
   Set up the blueprint-markdown skill from
   https://github.com/lebinhchieu/blueprint-markdown/tree/master/skills/blueprint-markdown
   ```

   The agent fetches and installs it. Reload the session afterward. ([details](#the-skill--ai-agent-integration))

2. **Install the extension** from the VS Code Marketplace:

   ```bash
   code --install-extension ChieuLe.blueprint-markdown-chieu
   ```

   ([details](#the-extension--preview-renderer))

3. **Disable the conflicting built-in** — Extensions (`Ctrl+Shift+X`) → search `@builtin mermaid` → **Markdown Mermaid features** → **Disable** → Reload Window. ([why](#known-conflict--vscodemermaid-markdown-features))

4. **Ask your AI to write with Blueprint Markdown** — e.g. *"Write the release notes using the blueprint-markdown skill."* The skill emits `:::` directives instead of HTML.

5. **Preview & pick a theme** — open the `.md` file → `Ctrl+Shift+V`, then `Ctrl+,` → search `blueprintMarkdown` to choose from [10 themes](#themes). Enjoy.

---

## The Skill — AI Agent Integration

The `blueprint-markdown` skill lives in `skills/blueprint-markdown/`. It teaches
your AI coding agent to **author** the directive syntax automatically.

**What it does:**
- Writes `:::cards`, `:::callout`, `:::steps`, `:::timeline` and other directives instead of HTML.
- Auto-triggers whenever you ask for rich docs, release notes, reports, or status pages — no slash command needed.
- Auto-formats **Claude Code plan-mode files** (`~/.claude/plans/*.md`) with rich directives so they render beautifully in the extension.
- Falls back to plain CommonMark for non-Blueprint contexts (GitHub, Slack, Notion).
- Loads the full attribute reference (`references/syntax.md`) on demand for precise output.

### Install

**Quick setup — paste this into your AI coding agent:**

```
Set up the blueprint-markdown skill from
https://github.com/lebinhchieu/blueprint-markdown/tree/master/skills/blueprint-markdown
```

**Manual — if you already cloned this repo:**

```bash
# Global — available in every project (symlink, no duplication):
ln -s "$PWD/skills/blueprint-markdown" ~/.claude/skills/blueprint-markdown

# Project-scoped — this repo only:
mkdir -p .claude/skills && cp -r skills/blueprint-markdown .claude/skills/
```

Restart Claude Code (or reload the session) after placing the skill.

**Via the Claude Code plugin marketplace** — this repo also bundles both skills
(`blueprint-markdown`, `mermaid-diagrams`) and the `skimmable` output style as an
installable marketplace, no cloning required:

```
/plugin marketplace add lebinhchieu/blueprint-markdown
/plugin install blueprint-markdown-skills@blueprint-markdown-skills-marketplace
```

Enable auto-update from `/plugin` → **Marketplaces** →
`blueprint-markdown-skills-marketplace` → **Enable auto-update**, or update
manually with `/plugin marketplace update lebinhchieu/blueprint-markdown`.

### Skill files

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill definition — name, description, grammar rules, authoring principles |
| `references/syntax.md` | Full per-directive attribute reference (loaded on demand) |
| `assets/sample.md` | Demo fixture exercising every directive — useful as a test file |

---

## The Extension — Preview Renderer

The VS Code extension renders the `:::` directives produced by the skill.
It hooks VS Code's **built-in Markdown preview** — no new panels, no extra commands.

### Install

**VS Code Marketplace *(recommended)*:**

```bash
code --install-extension ChieuLe.blueprint-markdown-chieu
```

Or: **Extensions** (`Ctrl+Shift+X`) → search **Blueprint Markdown** → Install.

**From VSIX:** download the latest from
[Releases](https://github.com/lebinhchieu/blueprint-markdown/releases), then
**Extensions panel → ⋯ → Install from VSIX…**.

**Build from source:**

```bash
git clone https://github.com/lebinhchieu/blueprint-markdown.git
cd blueprint-markdown
npm install && npm run build
# Press F5 to launch the Extension Development Host
```

### Known conflict — `vscode.mermaid-markdown-features`

VS Code ships a built-in extension called **Markdown Mermaid features** (`vscode.mermaid-markdown-features`) that also renders Mermaid diagrams in the Markdown preview. When both extensions are active they collide, and Mermaid diagrams will not render correctly.

> [!WARNING]
>**Fix:** Disable the built-in extension:
>Extensions (`Ctrl+Shift+X`) → search **`@builtin mermaid`** → **Markdown Mermaid features** → **Disable** → Reload Window.

### Open the preview

Open any `.md` file → **`Ctrl+Shift+V`** (Markdown: Open Preview to the Side).

Quick test:

```markdown
:::tip
Blueprint Markdown is working!
:::
```

---

## Features

Beyond the directive components below, the extension adds:

- **Mermaid pan/zoom** — drag to pan, scroll/buttons to zoom, double-right-click to reset, one click to expand fullscreen.
- **`:::explorer`** — pins a mermaid diagram beside scrollable detail sections; clicking a diagram node scrolls to (and flashes) its matching `{#id}` section, and back.
- **`:::legend`** — a collapsible color-key panel for a diagram or any content block.
- **`:::revision` / `:::previous`** — flags a changed passage with a hover note and a click-to-reveal panel showing the prior text. Handy for tracked-change style docs.
- **TOC reading rail** — a scroll-spy table of contents down the side of the preview and exported HTML. Controlled by `blueprintMarkdown.toc` (`off` / `h2` / `h3`, default `h3`). Add `toc=h1|h2|h3` to a `card`, `callout`, `details`, or `step` to promote its title to a real heading that feeds the rail.
- **Heading shortcuts** — `Ctrl+1`…`Ctrl+6` sets the heading level of the current line while editing a Markdown file.
- **Review comments** — right-click a line in the preview to add a comment or an AI note; it's inserted inline at that line in the source.
- **32 snippets** (`bp-card`, `bp-callout`, `bp-tabs`, …) — one per directive, in `snippets/markdown.json`.

---

## Export to HTML

**Command:** `Blueprint Markdown: Export to HTML` (Command Palette `Ctrl+Shift+P`)

Converts the active `.md` file into a portable `.html` file that anyone can open in a browser — no extension required.

- All CSS is inlined; fonts, icons, and Mermaid diagrams load from CDN.
- The exported file uses the same theme you have active in the preview.
- The Mermaid CDN script is injected only when the document actually uses it.

> **Note:** Layout, components, and code highlighting work offline. Fonts, icons, and Mermaid diagrams require an internet connection.

---

## Standalone Preview (CLI / other editors)

No VS Code webview? `blueprint-preview` renders the same engine as a live, auto-reloading
page in your browser — works from any editor that can run a shell command, Zed included.

```bash
npm link                      # from this repo, once — puts `blueprint-preview` on your PATH
blueprint-preview doc.md      # opens a browser tab, live-reloads on every save
```

One server, many tabs: running it again on a different file reuses the same process and opens
a second tab, instead of spawning a new server. Right-click any text (or an existing comment
badge) in the preview for **Add Comment / Add AI Comment / Edit Comment** — it writes
`:comment[...]`/`:ai[...]` straight into the `.md` file on disk, same as the VS Code command.

Flags: `--theme=<name>` (see Themes below), `--toc=off|h2|h3`, `--port=<n>` (default `7337`), `--no-open`.

### Zed

Zed has no webview extension point, so there's no "Blueprint Markdown for Zed" preview pane —
instead, bind the CLI to a Zed **task**. Add to `.zed/tasks.json`:

```json
[
  {
    "label": "Blueprint preview",
    "command": "blueprint-preview",
    "args": ["$ZED_FILE"],
    "save": "current_file",
    "reveal": "never",
    "allow_concurrent_runs": true
  }
]
```

And a binding in `keymap.json`:

```json
{
  "context": "Editor && extension==md",
  "bindings": {
    "ctrl-shift-m": ["task::Spawn", { "task_name": "Blueprint preview" }]
  }
}
```

`Ctrl+Shift+M` on any `.md` file now opens (or updates) its preview tab.

---

## Themes

Reviewing AI output shouldn't feel like reading a wall of text. Choose a theme that
suits your mood — switch any time, preview refreshes instantly.

| Setting value | Name | Vibe |
|--------------|------|------|
| `light` *(default)* | Warm Artisan Light | Terracotta on warm parchment — editorial feel |
| `dark` | Warm Artisan Dark | Bright terracotta on near-black |
| `auto` | Auto | Follows VS Code's active light/dark theme |
| `neon-synthwave` | Neon Synthwave | Cyan + magenta on blue-black |
| `neon-cyberpunk` | Neon Cyberpunk | Electric green on black |
| `neon-vaporwave` | Neon Vaporwave | Purple + pink on violet-black |
| `aurora` | Aurora | Iridescent orchid pastels on pearl white |
| `jewel-garden` | Jewel Garden | Rich amethyst & emerald on ivory |
| `tropical-sorbet` | Tropical Sorbet | Bright coral & citrus on cream |
| `tropical-sorbet-night` | Tropical Sorbet Night | Coral & citrus candy on warm cocoa dark |

**How to change:**

- **Settings UI**: `Ctrl+,` → search `blueprintMarkdown` → pick from dropdown.
- **settings.json**:

  ```json
  "blueprintMarkdown.theme": "aurora"
  ```

---

## Syntax Quick Reference

Three directive forms — colon count is the grammar.

### Container `:::` (open + close)

Used by all block components.

```markdown
:::warning{title="Watch out"}
This action cannot be undone.
:::

:::cards{cols=3}
:::card{title="Speed" icon=bolt}
Compact directives generate fast.
:::
:::card{title="Size" icon=compress}
No HTML boilerplate.
:::
:::card{title="Themes" icon=palette}
10 palettes, one setting.
:::
:::
```

### Leaf `::` (single line)

Used by `progress` and `legend-item`.

```markdown
::progress{value=80 max=100 color=primary label="Completion"}
```

### Inline `:` (within paragraphs)

```markdown
Status: :chip[Stable]{success}  Shortcut: :kbd[Ctrl+Shift+V]  Priority: :rating{value=5 max=5}
```

### Component families

| Family | Directives |
|--------|-----------|
| Cards | `:::card` `:::cards` |
| Callouts | `:::callout` `:::note` `:::tip` `:::info` `:::warning` `:::danger` `:::success` |
| Collapse | `:::details` `:::accordion` |
| Layout | `:::columns` `:::col` |
| Timeline | `:::timeline` `:::event` |
| Navigation | `:::tabs` `:::tab` |
| Steps | `:::steps` `:::step` |
| Progress | `::progress` |
| Revision | `:::revision` `:::previous` |
| Explorer | `:::explorer` |
| Legend | `:::legend` `::legend-item` |
| Inline | `:chip` `:icon` `:color` `:kbd` `:button` `:tooltip` `:rating` `:comment` `:ai` |

### Color tokens

`primary` · `success` (`green`) · `warning` (`amber`) · `danger` (`red`) · `info` (`blue`) · `gray` · `low` (`yellow`) · `purple` · `teal` · `pink` · `cyan` · raw hex (e.g. `#0a7`)

### Fails silently — common mistakes

- ❌ Space after colons: `::: info` — use `:::info`
- ❌ More than one `{…}` block per directive line
- ❌ Multi-word values without quotes: `title=Two words` — use `title="Two words"`
- ❌ `:::progress` — use `::progress` (leaf, not container)
- ❌ `:::column` — use `:::col`
- ❌ Unclosed container — consumes rest of the document

> Full reference: [`skills/blueprint-markdown/references/syntax.md`](skills/blueprint-markdown/references/syntax.md)

---

## Contributing

Bug reports and feature requests → [GitHub Issues](https://github.com/lebinhchieu/blueprint-markdown/issues).
Pull requests welcome — open an issue first for significant changes.

```bash
npm run watch   # esbuild watch mode — rebuilds on every change
# F5 in VS Code → Extension Development Host
# "Reload Window" in dev host → picks up the latest build
```

---

## License

MIT © [Chieu Le](https://github.com/lebinhchieu) — see [LICENSE](LICENSE).
