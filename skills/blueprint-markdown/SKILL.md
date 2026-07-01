---
name: blueprint-markdown
description: >
  Load BEFORE writing any blueprint-markdown directive — never author :::/::/:name[]
  syntax from memory. The parser fails silently (a stray space or wrong colon count
  renders as plain text, no error), so guessing means a broken doc and a redo.
  Triggers: Plan Mode plan files (~/.claude/plans/*.md), implementation-notes files,
  any doc for the blueprint-markdown viewer, any component (card, callout, tabs, steps,
  timeline, progress, chip, icon, mindmap, …), "write it nicely / make it pretty / use cards /
  add callouts", or "turn this into a mind map / node graph".
  Rule: Only write in blueprint-markdown for file output, otherwise use plain markdown.
---

The blueprint-markdown viewer extends CommonMark with one grammar covering every rich
component. That grammar has exactly three forms. Everything else in this skill is either
the component catalog or the authoring judgment about when to use enhanced syntax vs plain.

> **Author directives only with this skill open — never from recall.**

---

## When to use enhanced syntax vs plain markdown

**Use enhanced directives** when the document is destined for the blueprint-markdown viewer,
when the user explicitly asks for rich components, or when a guide/report/page would clearly
benefit from visual structure (callouts, cards, steps, timeline).

**Stay in plain markdown** for GitHub READMEs, PR descriptions, Slack messages, wiki pages,
or any `.md` file that won't be rendered by the viewer. The reason: directives like `:::card`
are not valid CommonMark — a plain viewer renders them as literal text, which is broken output.

**When the target is ambiguous**, ask one quick question ("Is this for the blueprint-markdown
viewer, or a plain markdown target like GitHub?") or default to plain and mention you can
enrich it if they want.

**Mixed documents are fine.** Standard markdown (headings, bold, lists, tables, fenced code,
`- [ ]` tasks, `==highlight==`) always works everywhere and should be preferred over a
directive when the directive doesn't add meaningfully to the reading experience.

---

## The grammar — three forms, one rule

All custom components use the same grammar. Learn these three forms and you know every feature.

> **Colon count *is* the grammar.** `:::` = container block, and it opens **and closes** with `:::`.
> `::` = leaf block, used by **`progress` only**. `:` = inline. When in doubt, it's `:::`.

### 1. Container block (open with `:::`, close with `:::`)
```
:::name{attrs}
Body **markdown** — any nested content, including other directives.
:::
```

### 2. Leaf block (`::`, single-line — only `progress`)
```
::name{attrs}
```

### 3. Inline
```
:name[visible text]{attrs}
```

**Attributes** are uniform across all three forms:
- `key=value` or `key="multi word"` — named attributes
- `{danger}` or `{success}` — bare value shorthand (each directive defines what bare value means)
- `.class` and `#id` — CSS hooks
- `{open}`, `{fill}` — boolean flags (no value needed)

---

## Exact syntax — silent-failure traps

The parser enforces rules that produce **no error message when broken** — the directive just
renders as plain text or an unstyled block. Check every directive you write against these:

| Rule | ✓ Correct | ✗ Wrong (silent fail) |
|------|-----------|----------------------|
| No space after colons | `:::info` | `::: info` |
| One `{…}` block only | `:::callout{type=info title="X"}` | `:::callout{info} {title="X"}` |
| Nesting = repeated `:::`, never `::::` | `:::cards` → `:::card` | `::::card` |
| Multi-word values must be quoted | `title="Two words"` | `title=Two words` |
| Bare-word order matters (first = primary) | `{danger open}` → color=danger | `{open danger}` → color lost |
| Blocks open AND close with `:::` | `:::callout{…}` … `:::` | `::callout{…}` … `::` |
| `::` is `progress` only | `::progress{…}` | `:::progress{…}` |
| Use `col`, not `column` | `:::col` | `:::column` |
| Steps/tabs only style their own children | `:::steps` → `:::step{…}` | `:::steps` with a `1.` list |
| `:::mindmap` body is headings, not directives | `# Heading` / `## Heading` inside | `:::card` nested inside `:::mindmap` (silently dropped — see below) |

Every container needs a matching closing `:::`. An unclosed block silently consumes the rest
of the document.

---

## Component catalog (one example per feature)

Read `references/syntax.md` for the full attribute reference per directive. This section is
just enough to write from memory.

### Containers (:::)

**Card**
```
:::card{title="Zero boilerplate" icon=auto_awesome}
Write clean markdown inside.
:::
```
Card grid: `:::cards{cols=3}` containing `:::card` children.

**Callout / alert** — named types: `note`, `tip`, `info`, `warning`, `danger`, `success`
```
:::warning{title="Heads up"}
Custom-titled warning.
:::

:::callout{type=danger title="Stop" icon=error}
Generic escape hatch for any type.
:::
```

**Collapse / expand**
```
:::details{title="Show more" open}
Hidden content revealed on click. `{open}` starts expanded.
:::
```

**Accordion** — groups `:::details` blocks so opening one closes others
```
:::accordion
:::details{title="Item 1"}
Content.
:::
:::details{title="Item 2"}
Content.
:::
:::
```

**Columns**
```
:::columns{count=2 gap=lg}
:::col
Left content.
:::
:::col
Right content.
:::
:::
```

**Timeline**
```
:::timeline
:::event{date="2024-01" icon=rocket color=primary}
**Launched** — first public release.
:::
:::
```

**Tabs**
```
:::tabs
:::tab{title="npm"}
`npm install x`
:::
:::tab{title="pnpm"}
`pnpm add x`
:::
:::
```

**Steps** (auto-numbered)
```
:::steps
:::step{title="Install"}
Run `npm install`.
:::
:::step{title="Open"}
Drag the file onto `viewer.html`.
:::
:::
```

**Revision** — flag a changed passage without altering how the current content looks
```
:::revision{note="Tightened the rate limit" date="2026-06-26"}
The API accepts up to 500 requests per minute.

:::previous
The API accepts up to 1000 requests per minute.
:::
:::
```

**Mindmap** — turns headings into an interactive node graph. Heading level = tree depth;
everything below a heading up to the next one is that node's detail-drawer content. The
body is **plain markdown headings, not nested directives** — don't put `:::card` etc. inside.
```
:::mindmap
# Database latency > 2s
Dashboards spin on every load.

## Add Redis cache {#redis}
Cache hot queries; TTL 60s.

## Add CDN
Shares invalidation logic with [[redis]].
:::
```
`{#id}` sets a stable id (else slugified from the heading text); `[[id]]` anywhere in a
body draws a dashed cross-link to that node. Full depth→type/color mapping.

### Leaf blocks (::)

```
::progress{value=70 max=100 color=primary label="Build coverage"}
```

### Inline elements (:)

```
Status: :chip[Active]{success}  :chip[Beta]{color=warning variant=outline}  :chip[Minor]{low}
Icon: :icon[home]  :icon[settings]{fill size=20 color=info}
Color: :color[critical issue]{danger}
Keys: :kbd[Ctrl+K]
Button: :button[Get started]{href="/start" color=primary variant=solid}
Hover: :tooltip[this word]{tip="Tooltip content."}
Stars: :rating{value=4 max=5}
```

### Reused GFM — no directive needed

| Feature | Syntax |
|---------|--------|
| Task list | `- [ ]` / `- [x]` |
| Table | pipe tables |
| Mark / highlight | `==text==` |
| Code + line highlight | ` ```js {1,3-5} title="app.js" ` |
| Mermaid diagram | ` ```mermaid ` |
| Heading anchor | `## Title {#anchor}` |

---

## Authoring principles

**Shallow nesting.** More than two directive levels deep usually signals the content needs
restructuring, not more nesting.

**Read the raw source.** A well-written `.md` file should be perfectly legible even before
rendering. If a directive makes the raw text harder to scan than a plain list or heading
would, use the plain version.

**Reuse GFM before reaching for a directive.** A two-column `:::columns` is right for a
comparison layout; a simple list of items is right for a simple list.

**Color tokens** — `primary success warning danger info gray low`. Full palette, aliases, and hex syntax in `references/syntax.md`.

---

## Validation

After writing a document, run the standalone validator to catch silent failures:

```bash
node skills/blueprint-markdown/validate.mjs path/to/file.md
```

Checks: unclosed containers, unknown/typo'd names, wrong form (e.g. `:::progress`), and
near-miss lines (`::: card` with a space, `::::name` with four colons).

> **Coverage note:** block directives only (`:::container`, `::leaf`). Inline `:name[text]`
> directives are not checked — review those manually.

---

## Reference files

Read these as needed — they are not loaded by default:

- **`references/syntax.md`** — full per-directive attribute tables, the color-token palette,
  Material Symbols icon notes, and the fail-soft rule. Read it when you need a specific
  attribute name or value set.
