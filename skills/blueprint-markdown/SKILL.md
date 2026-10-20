---
name: blueprint-markdown
description: >
  Rich markdown for the blueprint-markdown viewer: Plan Mode plan files (~/.claude/plans/*.md),
  implementation notes, any doc using components (card, callout, tabs, steps, timeline, chip,
  icon, progress, …) or asked to "write it nicely / use cards / add callouts". File output only; plain markdown for chat, GitHub, PRs, wikis.
---

Extends CommonMark with one grammar for every component. Diagrams: `mermaid-diagrams` skill
(also owns `:::explorer`, `:::legend`). Narration/presentations: `prepare-present` skill.

## Plain vs enhanced

Enhanced directives only for files the blueprint viewer renders, or when the user asks for
rich components. Anywhere else (GitHub README, PR body, Slack, wiki) stay plain: `:::card` is
literal text in a plain viewer. Target unclear → ask once, or default to plain. GFM (headings,
tables, lists, `- [ ]`, `==mark==`, fences) always works; prefer it when a directive adds
nothing. If raw source reads worse with the directive, drop it. Max ~2 nesting levels.
This skill covers syntax only. If the `skimmable-writing` skill is available, follow it for
document structure and prose (deliverable-first); if not, just lead each section with its point.

## Grammar — three forms

> **Colon count is the grammar.** `:::` container (opens **and closes** with `:::`) ·
> `::` leaf, only `progress`, `pin` (+ `legend-item`, see mermaid-diagrams) · `:` inline. In doubt, `:::`.

```
:::name{attrs}
Body **markdown**, may nest other directives.
:::

::name{attrs}

:name[visible text]{attrs}
```

Attrs: `key=value`, `key="multi word"`, bare `{danger}` (each directive defines what bare
means), `.class`, `#id`, flags `{open}`. One `{…}` block only.

## Silent-failure traps

None of these errors; the directive just renders as text or unstyled. Unclosed container eats
the rest of the file.

| ✓ | ✗ |
|---|---|
| `:::info` | `::: info` (no space after colons) |
| `:::callout{type=info title="X"}` | `{info} {title="X"}` (one `{…}`) |
| `:::cards` → `:::card` | `::::card` (nest by repeating `:::`) |
| `title="Two words"` | `title=Two words` (quote multi-word) |
| `{danger open}` (first bare = primary) | `{open danger}` (color lost) |
| `:::callout{…}` … `:::` | `::callout{…}` … `::` |
| `::progress{…}` | `:::progress{…}` (`::` leaf-only) |
| `:::col` | `:::column` |
| `:::steps` → `:::step{…}` | `:::steps` over a `1.` list (tabs/steps style only their own children) |
| opener alone on its line, body below | body on the opener line |

## Catalog

Attrs, defaults and the color/icon palette: `references/syntax.md` — find an entry with
`grep -n '^##' references/syntax.md`, then Read with offset/limit; don't read the whole file.

Containers (`:::`):
- `card{title icon}`, `cards{cols=1-4}` (grid of cards)
- `note|tip|info|warning|danger|success{title icon}`; `callout{type title icon}` for any type
- `details{title open}`; `accordion` (one open at a time) around `details`
- `columns{count=2-4 gap=sm|md|lg}` or `{min=320px}` (auto-fit, replaces `count`; px/rem/em/ch) with `col{span sticky}` (`sticky` is a bare flag)
- `timeline` with `event{date icon color}`
- `tabs` with `tab{title}`; `steps` (auto-numbered) with `step{title}`
- `revision{note date}` with `:::previous` nested inside it (flag a changed passage); `compare` with `before{title}` / `after`
- `annotated` + `marker{n title}` + `pins` + `::pin{x y n}` (x,y required, 0-100) — numbered
  markers linking code lines, image regions or phrases (`:marker[phrase]{n=1}`) to margin
  notes; notes pair with material by number, inside one `:::annotated`
- `question{id title multi rec="…"}` + `option{title rec}` + `qa-copy` — answerable Q&A (answers stay in browser localStorage; Copy button). Used by the blueprint-grill skill
- `toc=h1|h2|h3` on card/callout/details/step makes the title a real heading (feeds TOC rail)

Leaf (`::`): `::progress{value max color label}`

Inline (`:`): `:chip[text]{success}` · `:icon[home]{fill size=20}` · `:color[text]{danger}` ·
`:kbd[Ctrl+K]` · `:button[text]{href variant}` · `:tooltip[text]{tip="…"}` · `:rating{value=4 max=5}` ·
`:comment[note]{author date}` · `:ai[note for the AI]` · `:tag[verified]{src="file:line"}`
(`verified`, `inferred`, `not verified`)

Examples:

````
:::annotated
```ts start=40 marks="1:1"
const t = sign(user)
```
:::marker{n=1 title="Why"}
Sign before storing.
:::
:::
````

```
:::cards{cols=2}
:::card{title="Fast" icon=bolt}
Body with :chip[new]{success}.
:::
:::warning{title="Heads up"}
Callout body.
:::
:::
```

GFM extras: ` ```js {1,3-5} title="app.js" ` line highlight/title · ` ```diff lang=ts ` (paste
`git diff`) · ` ```mermaid ` · ` ```ts start=40 marks="1:1" ` markers.
Heading `{#anchor}` works only inside `:::explorer`; elsewhere it prints literally.

Colors: `primary success warning danger info gray low` (+ `purple teal pink cyan`; aliases
`green amber red blue yellow`; hex ok). Prefer tokens.

## Validate

Run once, after the file is written:

```bash
node <this skill's dir>/validate.mjs path/to/file.md
```

Catches unclosed containers, unknown names, wrong form (`:::progress`), near-misses
(`::: card`, `::::name`). Block directives only; check inline `:name[…]` by eye.
