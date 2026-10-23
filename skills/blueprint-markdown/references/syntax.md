# Blueprint Markdown — Full Attribute Reference

## Contents

Color tokens · Containers (card, cards, callouts, details, accordion, columns/col,
timeline/event, tabs/tab, steps/step, revision/previous, annotated/marker/pins/pin, compare, question/option/qa-copy, svg) ·
Leaf (progress) · Inline (chip, icon, color, kbd, button, tooltip, rating, comment, ai, tag) ·
Fenced code extensions · Strict syntax nuances · Fail-soft rule.

Look up one entry: `grep -n '^### ' references/syntax.md`, then Read with offset/limit.
`:::explorer` and `:::legend` live in the mermaid-diagrams skill; narration (`:::narration`,
`:::say`, `:cue`, `:at`) in prepare-present.

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
| `toc` | `h1` \| `h2` \| `h3` | — | Render `title` as a real heading (same look) — feeds the TOC rail + document outline. Other values ignored. |

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
| `toc` | `h1` \| `h2` \| `h3` | — |

`toc` also applies to the named types above (they all alias to `:::callout`): render
`title` as a real heading (same look) — feeds the TOC rail + document outline. Other
values ignored.

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
| `toc` | `h1` \| `h2` \| `h3` | — |

`toc` renders `title` as a real heading inside the summary bar (same look) — feeds the TOC
rail + document outline. Other values ignored.

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
| `min` | CSS length (`320px`, `20rem`) | — |

`min` switches to auto-fit: as many columns as fit, each at least that wide (`count` is then ignored).

**`:::col` attributes**

| Attr | Values | Default |
|------|--------|---------|
| `span` | integer (columns to span) | `1` |
| `sticky` | flag | — |

`{sticky}` pins the column while a taller sibling scrolls (it scrolls inside itself if taller than the viewport). Unpinned below 768 px.

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
| `toc` | `h1` \| `h2` \| `h3` | — |

`toc` renders `title` as a real heading (same look) — feeds the TOC rail + document
outline. Other values ignored. Not supported on `:::tab` (its title is a hidden-panel
button label, not a place a heading belongs).

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

### `:::annotated` / `:::marker` / `:::pins` / `::pin`

Numbered markers that link material to margin notes. A number appears on the material and on
its note; hovering or clicking either lights both (scoped to the nearest `:::annotated`).

```
:::annotated
```ts start=40 marks="1:1 4:2" title="auth.ts"
function login(user) {
  ...
```
The :marker[token is signed]{n=1} before it is stored.

:::pins
![screen](shot.png)
::pin{x=14 y=50 n=3}
::pin{x=48 y=36 w=34 h=30 n=4}
:::

:::marker{n=1 title="Why sign first"}
Note text.
:::
:::
```

On a wide container (≥ 760 px) notes sit in a side column level with their marker; narrow
screens stack them under the material.

| Directive | Form | Attrs |
|-----------|------|-------|
| `:::annotated` | container | — (holds the material and its `:::marker` notes) |
| `:::marker` | container | `n` (1–3 digits, or bare `{1}`), `title` |
| `:marker[phrase]` | inline | `n` — underlines the phrase and tags it with the badge |
| `:::pins` | container | wraps an image and its `::pin` leaves |
| `::pin` | leaf | `x`, `y` (0–100 %, required); `w`, `h` (%) turn the point into an outlined region; `n`; `label` (tooltip) |

Notes pair with material by number only, inside one `:::annotated` (a note with no matching
badge renders, but lights nothing); `::pin` without `x` and `y` renders nothing. Numbers repeat
freely across separate `:::annotated` blocks. A fence uses `marks="line:n …"`
(see [Fenced code extensions](#fenced-code)); marker lines are 1-based within the block.

---

### `:::compare`

Before/after pair, both sides visible (unlike `:::revision`, which hides the old text).
Stacks below 768 px.

```
:::compare
:::before{title="Old"}
limit = 1000
:::
:::after
limit = 500
:::
:::
```

`title` defaults to Before / After.

---

### `:::question` / `:::option` / `:::qa-copy`

Interactive Q&A (for the grilling skill). The reader picks options / types notes in the
preview; answers persist in the browser's localStorage and are **not** written to the file.
`:::qa-copy` shows progress and a **Copy answers** button (paste the text back to the agent).

```
:::question{id="r1-q1" title="Storage backend"}
Which store holds sessions?
:::option{title="SQLite" rec}
One file, zero setup. Any blueprint markdown here: code, images, mermaid.
:::
:::option{title="Postgres"}
Needs a server.
:::
:::

:::qa-copy
:::
```

| Directive | Attr | Values |
|-----------|------|--------|
| `question` | `id` | unique per doc, never reused (`r<round>-q<n>`); answers key off it |
| | `title` | short label, used in the copied text |
| | `multi` | bare flag: checkboxes instead of single choice |
| | `rec="text"` | recommended answer when there are no `:::option` children |
| `option` | `title` | label used in the copied text |
| | `rec` | bare flag: recommended option (chip + **Accept recommended** picks it) |
| | `id` | optional (default `o<index>`) |

Every question gets a Notes/other textarea. Clicks inside an option's body never select it —
only its header button does. `qa-copy` is a container (empty), not a leaf.

### `:::svg` — static SVG drawing

Draws inline SVG (custom illustrations, icons, charts, layouts). Static: no pan/zoom. Use
`mermaid` for flows/sequence/ER/state (auto-layout); `svg` for what mermaid can't express.
Two forms, same rendering:

````
:::svg{title="Service" caption="Happy path" width=360}
<svg viewBox="0 0 240 90">
  <rect x="10" y="10" width="220" height="70" rx="8" style="fill:var(--c-info-bg);stroke:var(--c-info)" stroke-width="2"/>
  <text x="120" y="52" text-anchor="middle" font-size="16" fill="var(--c-info-text)">Service</text>
</svg>
:::

```svg
<svg viewBox="0 0 480 90">
  <rect x="10" y="20" width="140" height="50" rx="8" style="fill:var(--c-success-bg);stroke:var(--c-success)" stroke-width="2"/>
  <text x="80" y="51" text-anchor="middle" font-size="16" fill="var(--c-success-text)">Build</text>
  <rect x="170" y="20" width="140" height="50" rx="8" style="fill:var(--c-info-bg);stroke:var(--c-info)" stroke-width="2"/>
  <text x="240" y="51" text-anchor="middle" font-size="16" fill="var(--c-info-text)">Test</text>
  <rect x="330" y="20" width="140" height="50" rx="8" style="fill:var(--c-warning-bg);stroke:var(--c-warning)" stroke-width="2"/>
  <text x="400" y="51" text-anchor="middle" font-size="16" fill="var(--c-warning-text)">Ship</text>
</svg>
```
````

| Form | Attrs | Notes |
|------|-------|-------|
| `:::svg{…}` … `:::` | `title`, `caption`, `width` | Container only (`::svg` and `::: svg` don't work). Body is the raw `<svg>` (a single ` ```svg ` fence inside is unwrapped). Other attrs are ignored. |
| ` ```svg ` fence | none | Frame only; info-string words (`title=`) are ignored. The tag must be lower-case `svg` (` ```SVG ` renders as code). Fills the column (no `width`): use it for wide diagrams; icons and small drawings go in `:::svg{width=…}`. Use `xml` (or a 4-backtick outer fence) to show SVG *source*. |

| Attr | Values | Default |
|------|--------|---------|
| `title` | plain text (no markdown); visible title bar and the accessible name | none; accessible name is `SVG drawing` |
| `caption` | inline markdown, shown under the drawing | none |
| `width` | 1-4 digits with optional `px` or `%`, e.g. `360`, `50%`; anything else ignored | full column |

**Authoring rules**

- Always give a `viewBox`; omit `width`/`height` on `<svg>` (size the figure with `width=`). Add `width=` for icons and small diagrams, otherwise a viewBox-only drawing fills the column (capped at 32rem tall).
- Colour with theme tokens through `var()` or `currentColor`; no hard-coded hex (brand colours excepted; they don't follow dark themes). Unfilled `<text>`/shapes already take `--text-base`, so never set `fill="black"`/`"#000"`/`"#fff"`.
- Never: `<script>`, `on*=` handlers, `<foreignObject>`, external URLs (`http(s):`), animation/SMIL (`<animate>`, `<set>`, CSS `@keyframes`). The renderer removes them silently; `validate.mjs` warns on `<script>`, `on*=`, `<foreignObject>`, external URLs and SMIL, but not on CSS `@keyframes`.
- Allowed: shapes, `text`/`tspan`/`textPath`, gradients, `pattern`, `clipPath`, `mask`, `marker`, basic `filter` blur/shadow, `<style>` (rules scoped to the figure; no `@` rules), `<title>`/`<desc>`, and raster `<image href="data:image/png|jpeg|gif|webp;base64,…">`. Other `data:` URIs are removed.
- Ids, `#ref`, `url(#…)` and author class names are prefixed per block, so figures never clash; don't prefix by hand. Only `em-svg-*` classes pass through.
- Limits: 256 KB source, 20 000 elements, depth 64. Over a limit or malformed markup shows a red "Can't draw this SVG" callout in place.
- Accepted residuals: decompression-bomb image dimensions, animated GIF/WebP, huge `feGaussianBlur` `stdDeviation`, and `pattern`→`pattern` reference chains (not capped; keep these modest).

**Theme tokens** (defined for every theme)

| Use for | Tokens |
|---|---|
| Stroke / accent | `--c-{role}` |
| Soft fill | `--c-{role}-bg` |
| Text on a soft fill | `--c-{role}-text` |
| Text on a solid `--c-{role}` fill | `--text-on-solid` |
| Roles | `primary success warning danger info gray low purple teal pink cyan` |
| Neutral text | `--text-base`, `--text-muted`, `--text-faint` |
| Neutral surfaces / lines | `--bg-base`, `--bg-surface`, `--bg-raised`, `--bg-overlay`, `--border-color` |

Pair a `-bg` fill with a `-text` label and a `--c-role` stroke: readable in all themes.
Both `fill="var(--c-info)"` and `style="fill:var(--c-info)"` work; optional fallback
`var(--c-primary, #c05a28)`. Palette classes may replace `var()`: `em-svg-{role}` (soft fill +
stroke), `em-svg-{role}-text`, `em-svg-{role}-solid`, plus `em-svg-text`, `em-svg-muted`, `em-svg-line`.

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

### `:tag[label]`

Truth status of a claim, optionally with the source behind it. Known labels pick their own
colour: `verified`/`pass` green, `inferred`/`not verified`/`unverified` amber,
`failed`/`fail`/`broken` red; anything else gray. `color` overrides.

```
:tag[verified]{src="src/core/fence.ts:38"}
:tag[inferred]
:tag[custom]{color=info}
```

| Attr | Values | Default |
|------|--------|---------|
| `src` | `file:line` text; click copies it | — |
| `color` | [color token](#color-tokens) | by label |

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
| Line numbers | `start=40` | Adds a gutter numbered from 40. `{…}` and `marks` stay 1-based within the block |
| Diff | ` ```diff ` (+ `lang=ts`) | Tinted +/- rows; with `@@` hunks, old/new line-number gutter. See below |
| Markers | `marks="3:1 7:2"` | Badge ① on line 3, ② on line 7, linked to `:::marker{n=1}` / `{n=2}` (see `:::annotated`) |

**` ```diff `** renders a unified diff: added/removed rows are tinted, `@@` hunk headers drive an
old/new line-number gutter, and `lang=ts` syntax-highlights the code under the signs. Paste
`git diff` output as-is, or write a bare `+`/`-` snippet with no headers. Signs and numbers are
generated content, so copying gives plain code. `title=`, `{lines}` and `marks=` work as in any
fence (line numbers there count rows of the diff, headers included).

````
```diff lang=ts title="auth.ts"
@@ -10,4 +10,5 @@ function login()
   const user = find(id)
-  return token
+  const token = sign(user)
+  return token
```
````

**` ```mermaid `** (the language identifier `mermaid`) emits a `<div class="mermaid">` block; `mermaid.js` renders it on page load.

**Mermaid colors — never hardcode hex.** The preview already themes the diagram's base
palette (background, text, borders) from the active theme; the only thing that can clash is
a `classDef`/`style` override you add yourself with a literal hex. If a diagram needs to
highlight specific nodes, use the same CSS variables as the [color tokens](#color-tokens)
table — the full triad per role, not just the accent (`var(--c-primary)`,
`var(--c-danger-bg)`, `var(--c-danger-text)`, `var(--border-color)`, …) — instead: mermaid
inlines the string as CSS, so `var()` resolves live against whichever theme is active:

```
classDef alert fill:var(--c-danger-bg),stroke:var(--c-danger),color:var(--c-danger-text)
class Fail alert
```

The same `var()` resolution applies to `stroke-width`, `stroke-dasharray`, and `linkStyle`
(edges, not just nodes) — any mermaid style property, not only `classDef`/`style`.

**Every color needs a legend** — `:::legend` + `::legend-item`; syntax and rule in the
[mermaid-diagrams skill](../../mermaid-diagrams/SKILL.md) §4.

Standard GFM mark: `==text==` renders as `<mark>` — in surrounding prose only. Mermaid node
labels (`["..."]`) don't run through this renderer at all; inside one, `==text==` renders as
literal `==text==`. For bold/italic *inside* a label, use `<b>`/`<i>` directly in the quoted
string — confirmed to render as real formatting under `securityLevel:'strict'`, not stripped.

---

## Strict syntax nuances {#strict-rules}

The SKILL.md traps table covers all common failures. Three additional nuances:

- **Opener line must be alone.** Body text on the same line as `:::name{…}` is not parsed —
  always start the body on the next line.
- **Unclosed container** renders with class `directive-unclosed` (visible but unstyled) and
  silently consumes everything to end-of-file into its body.
- **A fenced block hides directives from the parser entirely.** Lines inside ``` / ~~~ are
  never classified, so a directive shown as an example inside a ` ```` ` fence is not
  parsed — and `validate.mjs` may attribute an error elsewhere in the file to that example's
  line number. Check the real unclosed block, not the reported line.

---

## Fail-soft rule {#fail-soft}

A directive name with no registered renderer handler falls back to a visible labelled block
rather than breaking the page. This means:

1. Unknown directive names degrade gracefully — visible but unstyled.
2. New features can be added to the renderer independently of the grammar.
3. When authoring, stick to the names in this reference; anything outside it renders as a
   fallback block, not an error, but it also won't look right.
