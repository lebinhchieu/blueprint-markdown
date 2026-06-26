# Blueprint Markdown Showcase

> Rich, themed documents — authored by AI in seconds, verified at a glance.

---

## Why Not HTML Artifacts?

:::cards{cols=3}
:::card{title="Smaller output" icon=compress}
Plain `:::` directives instead of kilobytes of generated HTML, CSS, and JS.
:::
:::card{title="Fewer tokens" icon=bolt}
A card written as a directive costs a fraction of the tokens an equivalent artifact does.
:::
:::card{title="Easier to verify" icon=fact_check}
Directives read like plain text in source. Spot mistakes without parsing markup.
:::
:::

---

## Callouts

:::note
A **note** for extra context. Use it for asides that don't block the reader.
:::

:::tip
A **tip** for a smarter or faster approach. Keep it actionable.
:::

:::info
:::revision{note="Expanded description to include definitions" date="2026-06"}
An **info** block for background knowledge — version history, prerequisites, definitions.
:::previous
An **info** block for background context.
:::
:::
:::

:::warning{title="Check before you proceed"}
A **warning** for steps that might have side effects or require care.
:::

:::danger{title="Irreversible action"}
A **danger** callout for destructive operations — deletes, resets, breaking changes.
:::

:::success{title="You're good to go"}
A **success** callout to confirm a completed step or a green path.
:::

---

## Cards & Grid

:::cards{cols=3}
:::card{title="Themes" icon=palette}
9 carefully crafted palettes — from warm editorial to neon synthwave. Switch in one setting.
:::
:::card{title="Offline-first" icon=wifi_off}
:::revision
Fonts, icons, and Mermaid are bundled. Works without any internet connection.
:::previous
Hello world
Hello world
:::
:::
:::
:::card{title="Zero config" icon=settings_suggest}
Install the extension, open a `.md` file, press `Ctrl+Shift+V`. That's it.
:::
:::card{title="AI-ready" icon=smart_toy}
Pair with the Claude Code skill and Claude writes the directives for you automatically.
:::
:::card{title="Fail-soft" icon=shield}
Unknown or malformed directives degrade to readable plain text — never a crash or blank page.
:::
:::card{title="Composable" icon=layers}
Nest cards inside tabs, steps inside columns, callouts anywhere. Mix freely.
:::
:::

---

## Tabs

:::tabs
:::tab{title="npm"}
```bash
npm install blueprint-markdown-chieu
```
:::
:::tab{title="pnpm"}
```bash
pnpm add blueprint-markdown-chieu
```
:::
:::tab{title="yarn"}
```bash
yarn add blueprint-markdown-chieu
```
:::
:::tab{title="VS Code"}
```bash
code --install-extension ChieuLe.blueprint-markdown-chieu
```
:::
:::

---

## Steps

:::steps
:::step{title="Install the VS Code extension"}
Open **Extensions** (`Ctrl+Shift+X`) → search **Blueprint Markdown** → click **Install**.

Or from the terminal:
```bash
code --install-extension ChieuLe.blueprint-markdown-chieu
```
:::
:::step{title="Install the Claude Code skill"}
:::revision{note="Updated path after repo reorganisation" date="2026-05"}
From the repo root, link the skill globally so it's available in every project:
```bash
ln -s "$PWD/skills/blueprint-markdown" ~/.claude/skills/blueprint-markdown
```
:::previous
Copy the `skills/` folder into `~/.claude/skills/` manually.
:::
:::
:::
:::step{title="Open a Markdown file"}
Open any `.md` file in VS Code, then press **`Ctrl+Shift+V`** to open the preview side-by-side.
:::
:::step{title="Ask Claude for rich content"}
The skill auto-triggers. Ask Claude to write a report, a plan, or documentation — it will
use `:::` directives instead of HTML artifacts.
:::
:::step{title="Pick your theme"}
Open settings (`Ctrl+,`), search `blueprintMarkdown`, and select a palette from the dropdown.
The preview refreshes instantly.
:::
:::

---

## Timeline

:::timeline
:::event{date="Jun 2024" icon=rocket color=primary}
**v0.1.0 — Initial release.** Container directives, inline elements, Warm Artisan theme, Mermaid, bundled fonts.
:::
:::event{date="Aug 2024" icon=palette color=info}
**New palettes.** Added Neon Synthwave, Neon Cyberpunk, Neon Vaporwave, and `auto` theme mode.
:::
:::event{date="Oct 2024" icon=auto_awesome color=success}
:::revision{note="Theme count corrected after tropical-sorbet-night was added"}
**Jewel themes.** Aurora, Jewel Garden, and Tropical Sorbet palettes. Now 9 themes total.
:::previous
**Jewel themes.** Aurora, Jewel Garden, and Tropical Sorbet palettes. Now 8 themes total.
:::
:::
:::
:::event{date="2025" icon=smart_toy color=warning}
**Claude Code skill.** Companion skill teaches Claude to author directives instead of HTML artifacts.
:::
:::

---

## Progress & Stats

:::columns{count=2 gap=lg}
:::col
**Build health**

::progress{value=98 max=100 color=success label="Tests passing"}
::progress{value=85 max=100 color=primary label="Coverage"}
::progress{value=100 max=100 color=info label="Types checked"}
:::
:::col
**Token savings vs HTML artifacts**

::progress{value=90 max=100 color=success label="Smaller output"}
::progress{value=80 max=100 color=primary label="Fewer tokens used"}
::progress{value=95 max=100 color=warning label="Faster to generate"}
:::
:::

---

## Accordion — FAQ

:::accordion
:::details{title="Does this work offline?"}
:::revision{note="Added full asset list" date="2026-04"}
Yes. DM Sans, Playfair Display, JetBrains Mono, Material Symbols Outlined, and Mermaid are
all bundled during `npm run build`. No requests leave the machine at preview time.
:::previous
Yes. All assets are bundled. No internet connection required.
:::
:::
:::
:::details{title="Will directives break if opened on GitHub?"}
GitHub renders them as plain text — the source is still readable, just without visual styling.
The skill knows this and falls back to plain markdown for non-Blueprint targets.
:::
:::details{title="Can I use my own theme?"}
The palette is defined in `media/em-theme.css` via CSS custom properties. You can edit the
file directly, or use the `add-preview-theme` Claude Code skill to generate a new palette.
:::
:::details{title="Does it conflict with other Markdown extensions?"}
It only patches VS Code's built-in Markdown preview pipeline. It does not affect other
preview extensions, renderers, or exporters.
:::
:::

---

## Revision — Tracked Changes

:::revision{note="Updated token savings estimate after v0.1.6 benchmark" date="2026-06-26"}
Blueprint Markdown reduces Claude output by **60–90%** compared to equivalent HTML artifacts —
fewer tokens, faster responses, and cleaner stored context.
:::previous
Blueprint Markdown reduces Claude output by roughly **50%** compared to equivalent HTML artifacts.
:::
:::

The rate limit was also revised:

:::revision{note="Raised limit after infrastructure upgrade"}
The preview renders up to **2 000 directives** per document without any performance degradation.

:::previous
The preview renders up to ==500 directives== per document without any performance degradation.
:::
:::

---

## Inline Elements

Rich text stays inline and readable:

Status: :chip[Stable]{success} :chip[v0.1.6]{primary} :chip[MIT]{gray}

Priority: :rating{value=5 max=5}   Theme: :icon[palette]{fill color=primary size=20}   Shortcut: :kbd[Ctrl+Shift+V]

Highlight a :color[critical path]{danger} or call out a :color[recommended step]{success} inline.

:button[View on Marketplace]{href="https://marketplace.visualstudio.com/items?itemName=ChieuLe.blueprint-markdown-chieu" color=primary variant=solid}
:button[GitHub Repo]{href="https://github.com/lebinhchieu/blueprint-markdown" color=info variant=outline}

---

## Code — Line Highlighting

```typescript {1-3,8} title="src/extension.ts"
import * as vscode from 'vscode';
import { buildMarkdownItPlugin } from './markdownItPlugin';

export function activate(context: vscode.ExtensionContext) {
  return {
    extendMarkdownIt(md: any) {
      // Install the ::: directive block rule and inline rule
      return buildMarkdownItPlugin(md, context);
    }
  };
}
```

---

## Mermaid Diagram

```mermaid
flowchart LR
    A(["You ask Claude\nfor rich docs"]) --> B["blueprint-markdown\nskill auto-triggers"]
    B --> C["Claude writes\n::: directives"]
    C --> D["VS Code extension\nrenders preview"]
    D --> E(["You read, verify\nand enjoy ✓"])

    style A fill:#d97706,color:#fff,stroke:none
    style E fill:#16a34a,color:#fff,stroke:none
    style B fill:#3b82f6,color:#fff,stroke:none
    style C fill:#3b82f6,color:#fff,stroke:none
    style D fill:#3b82f6,color:#fff,stroke:none
```

---

## Columns — Comparison

:::columns{count=2 gap=lg}
:::col
### HTML Artifact

- Generates full HTML + CSS + JS
- Thousands of extra tokens per response
- Slow to produce, opaque to review
- Static styles, no theming
- Hard to diff or version in git
:::
:::col
### Blueprint Markdown

- Compact `:::` directives — plain text
- Fraction of the token cost
- Fast to generate, easy to scan raw
- 9 live themes, instant switch
- Clean diffs, readable source
:::
:::

---

:::success{title="Ready to try it?"}
Install the extension, link the skill, and ask Claude to write your next report, plan, or docs page.
The output will be smaller, faster, and beautiful.
:::
