# Session Handoff — `:::explorer` id-based pairing
**Date:** 2026-08-14 · **Project:** blueprint-markdown-chieu (enhanced-markdown-vscode) · **Branch:** at `5b70ea92` (v1.2.4)

> For the next AI session: read this file first to resume. It captures the
> requirements, decisions, rules, and current state of the work below.
>
> **Prior phase:** `.claude/session-notes/2026-08-13-explorer-directive.md` — the original
> `:::explorer` design. That work is **shipped**; read it only for background on *why* the
> directive exists. This file is the actionable one.

## Requirements & Goals

Make `:::explorer` node↔section pairing key off the **mermaid node id**, declared on the detail
heading with the `{#id}` anchor syntax blueprint already supports. Number-based pairing stays as
the fallback.

```
graph TD
  auth["AuthService"] --> store["TokenStore"]

### AuthService {#auth}
### TokenStore {#store}
```

**Problem being solved.** Today the pairing key and the reader-visible label are the same
string, which forces three limits:

| Restriction | Bites when |
|---|---|
| Key *is* the visible label | A box can't read `AuthService` and link to `### AuthService`. Numbering is imposed even when serial order carries no meaning |
| Renumbering cascades | Inserting a node between 2 and 3 means editing id + label + heading for every later node, plus `#5`-style prose cross-refs. Every miss fails silently |
| Subgraphs aren't targets | No detail section for a `subgraph` as a whole |

Separating key from display collapses all three.

## Decisions & Rationale

- **Reuse the existing `{#id}` heading anchor** rather than inventing new syntax. It's already
  in `skills/blueprint-markdown/SKILL.md`'s GFM table, so there's nothing new to document or
  teach.
- **Fallback, not replacement.** No `{#…}` on a heading → current leading-number rule applies.
  Both existing fixtures keep working untouched, and this is what makes the change safe to ship
  without a migration.
- **Probably *less* code, not more.** Current logic regexes `N<k>` out of both halves and
  compares integers. The new logic reads heading anchors into a string-keyed map and looks up
  node ids directly — one regex disappears.
- **Subgraph support comes nearly free** and is the reason to prefer this over other fixes:
  mermaid emits subgraph ids into the SVG, so `### Config resolution {#boot}` should pair with
  `subgraph boot[...]` once the key is an arbitrary string. **Needs verifying** — subgraphs
  render as `g.cluster`, not `g.node`, so the query selector at `explorerSync.ts:108` must be
  widened. Confirm the cluster id format before promising this.
- **Rejected — many-to-one pairing** (two nodes sharing one section). Needs new attribute syntax
  and no real diagram has demanded it yet. YAGNI; revisit only when a concrete case appears.
- **Rejected — extending linking to `erDiagram` / `sequenceDiagram`.** `references/syntax.md:398`
  already documents why these are not cheap: mermaid 11.15 rejects entity aliases, and the other
  types number elements positionally (`actor0`, `node-0`), so matching would silently mispair on
  any reorder. That reasoning still holds. Do not "fix" this as part of this work.

## Rules & Constraints

- **Fail-soft is non-negotiable.** A node with no matching heading, or a heading with no
  matching node, must render normally with no error — see `explorerSync.ts:113`. The new
  lookup must preserve this on both sides.
- **Unmarked means "nothing more to read."** Linked nodes get a dot (`markLinked`). That
  guarantee is what makes the diagram trustworthy — a reader must never wonder whether an
  unmarked box is hiding detail. Don't weaken it.
- **Headings must stay top-level** in the detail pane (`explorerSync.ts:92-99`, deliberate). A
  heading wrapped in a nested directive is not a link target.
- **Must survive `Export to HTML (single file)`** — sync is client-side JS.
- **Keep numbering as house style** for `~/.claude/diagrams/*.md`. Free-form ids make it easy to
  write a diagram with no numbers at all, which would break the agreed revision shorthand
  ("expand 3"). Numbers stay the default; ids are the escape hatch.
- Ponytail mode is active in the user's environment — smallest change that works.

## State, Files & Next Steps

**Current state:** design agreed, **not started**. `:::explorer` itself is shipped and working
as of v1.2.4.

**Key files:**
- `src/core/explorerSync.ts` — **all the work is here.** Client-side pairing:
  - `:41` `RE_NODE_ID = /…(?:flowchart|state|classId)-N(\d+)-\d+$/` — the author's id *is*
    preserved in the SVG, wrapped in a type prefix and a numeric suffix. Generalize the `N(\d+)`
    capture to an arbitrary id; keep the prefix/suffix anchoring
  - `:42` `RE_HEADING_NUM = /^\s*(\d+)\s*\./` — keep as the fallback path
  - `:94-104` `byNum: Map<number, HTMLElement>` → key becomes `string`; read the heading's
    `id` attribute first, fall back to the leading-number match
  - `:107-117` the pairing loop, and `Pair.n: number` (`:57`) → `key: string`
  - `:108` `pin.querySelectorAll('g.node')` — widen to include `g.cluster` for subgraphs
- `src/core/directives/explorer.ts` — block parsing/splitting. Header comment (`:5-6`) states
  pairing is entirely client-side; likely needs **no change**, but confirm the heading `{#id}`
  anchor survives `privateMd.render()` into the DOM `id` attribute
- `skills/blueprint-markdown/references/syntax.md:366` — the **Pairing** section; update
- `skills/blueprint-markdown/SKILL.md:220-248` — the Explorer catalog entry; update
- `skills/blueprint-markdown/validate.mjs` — see open question below

**Reference fixture (outside this repo):**
- `/home/chieule/.claude/diagrams/config-loading.md` — real `:::explorer` doc of the user's
  `~/.claude` boot order, 8 nodes, 3 subgraphs. Use it to regression-test the number fallback,
  and as the natural candidate for subgraph pairing (`⚙ Config resolution` / `📄 Instructions` /
  `🔌 Registered`).

**Open questions:**
- Does markdown-it emit `{#id}` on a heading as a DOM `id` in the explorer detail pane, or does
  the anchor plugin slugify/rewrite it? This decides whether the work is one file or two.
- Subgraph SVG id format — is `g.cluster`'s id the raw author id, or prefixed like nodes?
- Id collision: a heading `{#auth}` anchor and a page-level TOC anchor could collide. Check
  `src/core/toc.ts` for how anchors are currently allocated.
- Should `validate.mjs` warn on unmatched nodes/sections inside an `:::explorer`? Raised earlier
  as the cheapest guard against silent dead boxes — still unbuilt, and it gets *more* valuable
  with free-form ids, since there's no longer a number sequence to eyeball.

**Next steps:**
1. Answer the `{#id}` → DOM `id` question by rendering a test block and inspecting the pane.
2. Widen `RE_NODE_ID` and switch the map key to `string`, keeping number-matching as fallback.
3. Regression-test `diagrams/config-loading.md` — all 8 numbered pairs must still link.
4. Add `g.cluster` to the node query; test subgraph pairing against that same file.
5. Update `syntax.md` **Pairing** + `SKILL.md` Explorer entry with the id form and the fallback.
6. Consider the `validate.mjs` unmatched-pair warning.
7. Bump version, package `.vsix`.
