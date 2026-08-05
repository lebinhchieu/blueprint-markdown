# Enhanced Markdown — Full Attribute Reference

## Table of Contents

1. [Grammar overview](#grammar-overview)
2. [Shared color tokens](#color-tokens)
3. [Containers (:::)](#containers)
   - card, cards, callout/named types, details, accordion, columns/col, timeline/event, tabs/tab, steps/step, revision/previous, mindmap
4. [Leaf blocks (::)](#leaf-blocks)
   - progress
5. [Inline (: )](#inline)
   - chip, icon, color, kbd, button, tooltip, rating, comment, ai
6. [Fenced code extensions](#fenced-code)
7. [Strict syntax rules](#strict-rules)
8. [Fail-soft rule](#fail-soft)

---

## Color tokens {#color-tokens}

A shared semantic palette used by `chip`, `callout`, `timeline`, `progress`, `button`,
`color`, and any other attribute named `color=`.

| Token | Aliases | CSS variable | Meaning |
|-------|---------|-------------|---------|
| `primary` | — | `--c-primary` | Brand / accent (indigo by default) |
| `success` | `green` | `--c-success` | Positive outcome |
| `warning` | `amber` | `--c-warning` | Caution |
| `danger` | `red` | `--c-danger` | Destructive / error |
| `info` | `blue` | `--c-info` | Informational |
| `gray` | — | `--c-gray` | Neutral / secondary |
| `low` | `yellow` | `--c-low` | Low / minor severity (golden yellow) |
| `purple` | — | `--c-purple` | Extra categorical hue (no fixed meaning) |
| `teal` | — | `--c-teal` | Extra categorical hue (no fixed meaning) |
| `pink` | — | `--c-pink` | Extra categorical hue (no fixed meaning) |
| `cyan` | — | `--c-cyan` | Extra categorical hue (no fixed meaning) |

**Aliases** (`green`, `amber`, `red`, `blue`, `yellow`) are accepted everywhere a token
name is accepted — they fold to the canonical token's CSS variable. Prefer the canonical
names in new documents so output respects user themes.

**Raw hex** is also accepted: `color=#0a7`, `color=#ff6600`. Use hex only for one-off
colours that have no semantic meaning in the token palette.

**Icon names** are Google Material Symbols ligature names: `home`, `settings`, `rocket`,
`rocket_launch`, `edit_note`, `auto_awesome`, `bolt`, `palette`, `extension`, `error`,
`info`, `check_circle`, `warning`, etc. The viewer loads the Material Symbols font once.

---

## Containers (:::) {#containers}

### `:::card`

A titled content card, optionally with a Material icon.

```
:::card{title="Title" icon=material_name}
Body markdown.
:::
```

| Attr | Values | Default | Notes |
|------|--------|---------|-------|
| `title` | string | — | Header text; omit for no header |
| `icon` | Material Symbols name | — | Shown next to title |

### `:::cards`

Responsive grid container for `:::card` children.

```
:::cards{cols=3}
:::card{title="A"} … :::
:::card{title="B"} … :::
:::
```

| Attr | Values | Default |
|------|--------|---------|
| `cols` | `1`–`4` | `1` |
| `gap` | `sm` \| `md` \| `lg` | `md` |

---

### Callouts — named types

Named types are shorthand for `:::callout{type=…}`. All accept `title` and `icon`.

```
:::note
:::tip
:::info
:::warning
:::danger
:::success
```

```
:::warning{title="Heads up"}
Content.
:::
```

### `:::callout` — generic escape hatch

```
:::callout{type=danger title="Custom" icon=error}
Content.
:::
```

| Attr | Values | Default |
|------|--------|---------|
| `type` | color token or any string | `info` |
| `title` | string | — |
| `icon` | Material Symbols name | auto from type |

---

### `:::details`

A native collapse/expand section.

```
:::details{title="Summary label" open}
Hidden content.
:::
```

| Attr | Values | Default |
|------|--------|---------|
| `title` | string | "Details" |
| `open` | flag | false |

---

### `:::accordion`

Groups `:::details` blocks. Opening one collapses the others (tab-like behavior).

```
:::accordion
:::details{title="A"} … :::
:::details{title="B"} … :::
:::
```

No own attributes beyond children.

---

### `:::columns` / `:::col`

Multi-column layout. Collapses to single column below 768 px by default.

```
:::columns{count=2 gap=lg}
:::col
Left.
:::
:::col{span=2}
Wide right.
:::
:::
```

**`:::columns` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `count` | `2`–`4` | `2` |
| `gap` | `sm` \| `md` \| `lg` | `md` |

**`:::col` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `span` | integer (columns to span) | `1` |

---

### `:::timeline` / `:::event`

Vertical timeline. Each `:::event` is one entry.

```
:::timeline
:::event{date="2024-01" icon=rocket color=primary}
**Launch** — first release.
:::
:::event{date="2024-06" color=success}
Milestone reached.
:::
:::
```

**`:::event` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `date` | string label | — |
| `icon` | Material Symbols name | none (dot only) |
| `color` | color token | default accent |

---

### `:::tabs` / `:::tab`

Tabbed content switcher.

```
:::tabs
:::tab{title="npm"}
\`npm install x\`
:::
:::tab{title="pnpm"}
\`pnpm add x\`
:::
:::
```

**`:::tab` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `title` | string | required |

---

### `:::steps` / `:::step`

Auto-numbered process steps.

```
:::steps
:::step{title="Install"}
Run `npm install`.
:::
:::step{title="Configure"}
Edit `config.json`.
:::
:::
```

**`:::step` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `title` | string | — |

---

### `:::revision` / `:::previous`

```
:::revision{note="Tightened the rate limit" date="2026-06-26"}
The API accepts up to 500 requests per minute.

:::previous
The API accepts up to 1000 requests per minute.
:::
:::
```

**`:::revision` attributes**

| Attr | Values | Default | Notes |
|------|--------|---------|-------|
| `note` | string | — | Description of the change; supports inline markdown |
| `date` | string | — | Optional label shown muted below the note in the hover tooltip |

**`:::previous`** is a plain `:::` container nested inside `:::revision`.

For word-level change emphasis, use `==highlight==` inside the current or previous block.

---

### `:::mindmap`

```
:::mindmap
# Database latency > 2s {type=context}
Dashboards spin on every load. p95 is 2.4s.

## Add Redis cache {#redis type=action}
Cache hot queries; TTL 60s.
```js
client.setex(key, 60, val)
```

### Warm cache on deploy {type=verify}
- [ ] Prefetch top 100 queries
- [ ] Alert if hit-rate < 80%

## Add CDN {type=action}
Offload static assets. Shares invalidation logic with [[redis]].
:::
```
| Attr | Values | Default | Notes |
|------|--------|---------|-------|
| `#id` | identifier | slugified heading text | Needed only when the heading is a `[[link]]` target |
| `type` | any string, e.g. `risk`, `owner-frontend` | none | Groups nodes by color — see below |

**Heading level** — tree depth.
**Coloring** — nodes with the same `type` always get the same color, assigned from a 6-color theme palette in the order distinct `type` values first appear (repeats if there are more than 6 types). Nodes with no `type` are colored by heading level instead (`#` = 1st palette color, `##` = 2nd, …).
**Cross-links** — `[[id]]` anywhere in a node's body
---

## Leaf blocks (::) {#leaf-blocks}

### `::progress`

A labeled progress bar.

```
::progress{value=65 max=100 color=primary label="Coverage"}
```

| Attr | Values | Default |
|------|--------|---------|
| `value` | integer or bare value | `0` |
| `max` | integer | `100` |
| `color` | color token | `primary` |
| `label` | string | — |

---

## Inline (:) {#inline}

### `:chip[text]`

A colored badge/tag.

```
:chip[Active]{success}
:chip[Beta]{color=warning variant=outline}
:chip[Minor]{low}
:chip[v2.1]{color=primary}
```

| Attr | Values | Default |
|------|--------|---------|
| bare value | color token or hex | — |
| `color` | color token or hex | required if no bare value |
| `variant` | `soft` \| `outline` \| `solid` | `soft` |

---

### `:icon[name]`

A Google Material Symbols icon rendered inline.

```
:icon[home]
:icon[settings]{fill size=20 color=info}
```

| Attr | Values | Default |
|------|--------|---------|
| text (primary) | Material Symbols ligature name | required |
| `fill` | flag | false |
| `size` | integer (px) | inherited |
| `color` | color token or hex | inherited |
| `weight` | `100`–`700` | `400` |

---

### `:color[text]`

Inline colored text.

```
:color[critical issue]{danger}
:color[note]{color=#0a7}
```

| Attr | Values | Default |
|------|--------|---------|
| bare value | color token or hex | required |
| `color` | color token or hex | — |

---

### `:kbd[keys]`

Styled keyboard key caps. `+` separates keys.

```
:kbd[Ctrl+K]
:kbd[⌘+S]
```

No attributes beyond the text.

---

### `:button[text]`

An inline linked button.

```
:button[Get started]{href="/start" color=primary variant=solid}
:button[Source]{href="https://github.com/…" variant=outline}
```

| Attr | Values | Default |
|------|--------|---------|
| `href` | URL | `#` |
| `color` | color token | `primary` |
| `variant` | `solid` \| `outline` \| `soft` | `solid` |

---

### `:tooltip[text]`

Hover text with a tooltip.

```
:tooltip[this term]{tip="Explanation shown on hover."}
```

| Attr | Values | Default |
|------|--------|---------|
| `tip` | string (tooltip content) | required |

---

### `:rating`

Star rating display (read-only).

```
:rating{value=4 max=5}
```

| Attr | Values | Default |
|------|--------|---------|
| `value` | number | `0` |
| `max` | integer | `5` |

---

### `:comment[note]`

An always-visible inline annotation badge — the note text goes directly inside `[…]`.
Optionally shows an author/date. No hover needed.

```
:comment[Should we clarify this?]{author="Alice" date="2026-07-30"}
```

| Attr | Values | Default |
|------|--------|---------|
| text (primary) | string (comment content) | required |
| `author` | string | — |
| `date` | string | — |
| `color` | color token | `info` |

---

### `:ai[note]`

Identical to `:comment` — same attrs, same badge — except its icon is a robot (`smart_toy`)
instead of `notes`. Meant for feedback addressed to an AI rather than a human collaborator,
e.g. leaving a note in a plan or generated doc for the AI to pick up next time.

```
:ai[Double-check this assumption next time]
```

Same attribute table as `:comment[note]` above (`author`, `date`, `color`, default `info`).

---

## Fenced code extensions {#fenced-code}

The enhanced renderer reads metadata after the language identifier in a code fence:

```
```js {1,3-5} title="app.js"
```

| Meta item | Format | Effect |
|-----------|--------|--------|
| Line ranges | `{1,3-5}` | Highlights lines 1 and 3–5 with `.hl` class |
| Title | `title="filename"` | Renders a header bar above the code |

**` ```mermaid `** (the language identifier `mermaid`) emits a `<div class="mermaid">` block; `mermaid.js` renders it on page load.

**Mermaid colors — never hardcode hex.** The preview already themes the diagram's base
palette (background, text, borders) from the active theme; the only thing that can clash is
a `classDef`/`style` override you add yourself with a literal hex. If a diagram needs to
highlight specific nodes, use the same CSS variables as the [color tokens](#color-tokens)
table (`var(--c-primary)`, `var(--c-danger-bg)`, `var(--text-base)`, `var(--border-color)`, …)
instead — mermaid inlines the string as CSS, so `var()` resolves live against whichever theme
is active:

```
classDef alert fill:var(--c-danger-bg),stroke:var(--c-danger),color:var(--text-base)
class Fail alert
```

Skip `classDef`/`style` entirely when the default theme coloring is enough — most diagrams don't need it.

Standard GFM mark: `==text==` renders as `<mark>`.

---

## Strict syntax nuances {#strict-rules}

The SKILL.md traps table covers all common failures. Two additional nuances:

- **Opener line must be alone.** Body text on the same line as `:::name{…}` is not parsed —
  always start the body on the next line.
- **Unclosed container** renders with class `directive-unclosed` (visible but unstyled) and
  silently consumes everything to end-of-file into its body.

---

## Fail-soft rule {#fail-soft}

A directive name with no registered renderer handler falls back to a visible labelled block
rather than breaking the page. This means:

1. Unknown directive names degrade gracefully — visible but unstyled.
2. New features can be added to the renderer independently of the grammar.
3. When authoring, stick to the names in this reference; anything outside it renders as a
   fallback block, not an error, but it also won't look right.
