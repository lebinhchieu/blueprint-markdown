# Blueprint Markdown

Extends VS Code's built-in Markdown preview with the **blueprint-markdown** directive grammar:
cards, callouts, columns, tabs, steps, accordions, timelines, chips, icons, colored text,
progress bars, line-highlighted code, and mermaid diagrams.

## Features

| Syntax | What it renders |
|--------|----------------|
| `:::card{title="…" icon=home}` | Bordered card with header and icon |
| `:::callout{type=warning title="…"}` | Info / tip / warning / danger / success callout |
| `:::columns` `:::col` | Responsive multi-column layout |
| `:::tabs` `:::tab{title="…"}` | Clickable tab strip |
| `:::steps` `:::step{title="…"}` | Numbered step sequence |
| `:::accordion` `:::details{title="…"}` | Coordinated-collapse accordion |
| `:::timeline` `:::event{title="…"}` | Vertical timeline |
| `:chip[text]{primary}` | Inline coloured chip |
| `:icon{home}` | Material Symbol icon |
| `:color[text]{danger}` | Coloured inline text |
| `:progress{value=70 max=100}` | Progress bar |
| ```` ```ts {1,3-5} title="app.ts" ```` | Line-highlighted code block with title |
| ```` ```mermaid ```` | Mermaid diagram |
| `` `src/file.ts:73` `` | Clickable link — opens file at line 73 in editor |

## Installation

### From source

```bash
cd blueprint-markdown-vscode
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host.

Open any `.md` file and run **Markdown: Open Preview to the Side** (`Ctrl+Shift+V`).

### Package

```bash
npm install
npm run package
# Produces blueprint-markdown-0.1.0.vsix
```

Install via **Extensions: Install from VSIX…** in VS Code.

## Architecture

```
Extension host (Node) — extension.ts / markdownItPlugin.ts
  ├─ Installs one markdown-it block rule that detects :::name spans
  ├─ Delegates rendering to the existing parseBlocks() + createRenderTree() engine
  ├─ Inline directives via installInlineRule(md)
  └─ Custom fence renderer via installFenceRenderer(md)

Preview webview — dist/preview.js (nonce'd, CSP-safe)
  ├─ hydrate(body)  — wires tab clicks, accordion collapse
  └─ mermaid.run()  — renders .mermaid blocks (mermaid bundled in, no dynamic import)
```

## Theming

The preview uses the **Warm Artisan Editorial** palette (terracotta primary, warm parchment
surfaces).  The theme is set via an extension configuration option — it does **not** automatically
follow VS Code's own light/dark theme unless you opt into that.

| Setting | Effect |
|---------|--------|
| `blueprintMarkdown.theme: "light"` *(default)* | Warm Artisan light — terracotta on parchment |
| `blueprintMarkdown.theme: "dark"` | Warm Artisan dark — bright terracotta on near-black |
| `blueprintMarkdown.theme: "auto"` | Follows VS Code's active light/dark theme |

Change the setting in **Settings** (`Ctrl+,` → search `blueprintMarkdown`).
The preview refreshes automatically without reloading VS Code.

The palette is defined in `media/em-theme.css` and all component styles use only
CSS custom properties — swap the palette there to customise.

## Fonts

DM Sans, Playfair Display, JetBrains Mono, and Material Symbols Outlined are bundled
locally (downloaded during `npm run build`). The preview works offline.

## Developing

```bash
npm run watch   # esbuild in watch mode — rebuilds on every source change
```

Then press **F5** to launch the Extension Development Host. The "Reload Window" command
in the dev host picks up the latest build.

## Source

Core engine: [`../blueprint-markdown`](../blueprint-markdown)  
The `src/core/` directory is a standalone copy.
