---
name: mermaid-diagrams
description: >
  Diagram design judgment: which mermaid type, readable layout, labeling, color/legend. Use
  whenever asked to draw, diagram, visualize, map out or sketch a flow, architecture,
  pipeline, call sequence, data model, state machine or process, even without the word
  "mermaid"; also to sanity-check someone else's diagram. Anywhere: chat, plan file, PR, doc.
  Also owns `:::explorer` and `:::legend` syntax (references/explorer.md).
---

# Mermaid Diagram Best Practices

Pick the type that matches the question, then make it legible. Writing a `:::explorer`
block? Read `references/explorer.md` first: it owns the grammar and which types link.

## 0. Should this even be a diagram?

- Linear flow, no branches → numbered list. Matrix of options → table. 2-node relationship → a sentence.
- 3+ connected parts → a real diagram.

## 1. Pick the type

| Need | Type |
|---|---|
| Steps, control flow, decision branches | `flowchart` |
| Who calls whom, over time | `sequenceDiagram` |
| Data model, entities & relationships | `erDiagram` |
| Object structure, inheritance | `classDiagram` |
| Lifecycle, modes | `stateDiagram-v2` |
| Schedule with durations/dependencies | `gantt` |
| Dated events, no duration | `timeline` |
| Hierarchical brainstorm, no flow | `mindmap` |

- Timing/ordering between actors → `sequenceDiagram`. Static topology → still `flowchart`.
- Always `flowchart`, never the legacy `graph` alias; mixing invites inconsistency.

## 2. Layout & readability

**Direction is about aspect ratio, not diagram type.** Estimate **L** (nodes on the longest
path) and **W** (widest fan-out). `LR` renders L as width, W as height; `TD` swaps them.

| L vs W | Direction |
|---|---|
| L > W (chain/pipeline) | **`TD`**: `LR` would be an unreadable strip |
| W > L (fan-out/hierarchy/hub) | **`LR`**: `TD` would be an unreadable band |
| L ≈ W | either, default `TD` |

Follow the numbers even when the diagram "sounds" horizontal (a pipeline): pages scroll
down, and ten stages in `LR` shrink to unreadable labels.

> **Don't fix a shape with `direction` inside a subgraph**: mermaid honors it only when no
> edge crosses the subgraph boundary; any external edge silently flips it back to the parent.
> For a color key use `:::legend` (§4), not an isolated subgraph.

- Group with `subgraph`, the main lever on legibility; for real groups, not just a box. If
  `classDef` declares groups the graph lacks as subgraphs, promote them.
- Cap ~15-20 nodes, ~5-6 outgoing edges per node, and watch density (40 edges on 14 nodes
  is a hairball) and fan-in (8+ incoming needs its own subgraph). Over the cap, split at a
  subsystem boundary and title each detail diagram after the node it expands.
- Order nodes so related ones sit adjacent; route shared edges through a middle node
  instead of crossing lanes.
- **Color is the default, not an opt-in**, for any diagram that clears §0 (not only
  explorer). Use the token triad, never a solid saturated fill with no stroke:
  `classDef role fill:var(--c-role-bg),stroke:var(--c-role),color:var(--c-role-text)`
  (role = `primary success warning danger info gray low …`). Vary lightness, not just hue.
  `classDef` for 2+ nodes sharing a category, `style` only for a one-off. **Every color gets a
  legend (§4).**
- Hue-independent channels: `stroke-width:2px` for emphasis, `stroke-dasharray:4 3` for
  state (planned vs active). `linkStyle <n> stroke:var(--c-role),stroke-width:2px` colors an
  edge (`<n>` = 0-based position in source order).
- `sequenceDiagram`, `erDiagram` and other non-flowchart types skip all color above (§2a).

## 2a. Type-specific notes

**sequenceDiagram**: declare every `participant` up front in left-to-right order (else order
follows first mention and reshuffles). `->>` = call, `-->>` = return; don't reuse solid for
both. `alt`/`opt`/`loop` instead of near-duplicate flows. Cap ~5-7 participants.

**erDiagram**: cardinality reads left-to-right (`||--o{` = one to zero-or-many); check which
side each symbol is on.

**classDiagram / stateDiagram-v2**: keep the id for explorer pairing, put readable text in
the label: `class auth["Auth Service"]` / `auth : Auth Service`. State: always show `[*]`
start (and end), or it reads as an unordered list of boxes.

Explorer linking support per type: `references/explorer.md` §Limits.

## 3. Labeling

- Quote every label. Inside quotes escape `<`/`>` (generics like `Array<T>`), `#quot;` for a
  literal `"`, `<br/>` for line breaks. Never name a node `end`; never start an id with `o`/`x`
  (parsed as an edge modifier).
- Node labels: short noun phrases (`Auth Service`), no undefined abbreviations, readable
  alone. Optional subtitle line: `svc_auth["Auth Service<br/><i>issues JWTs</i>"]`.
- `<b>`/`<i>` work in labels (strict mode). `==highlight==` does **not**: it prints
  literally inside `["..."]`; prose only.
- Edge labels: verb phrases (`writes to`), one per arrow, short (`<br/>` if longer), and
  consistent ("calls" vs "invokes") within a diagram.
- Short stable ids (`svc_auth`) with readable text in the label. In explorer the id is the
  pairing key: renaming it breaks the link unless the `{#id}` anchor changes too.

## 4. Legend

**Every `classDef`/`style` color needs a legend entry, no size exception**: without one a
reader can't tell emphasis from a failure state, even for a single colored node. Wrap the
diagram in `:::legend` with one `::legend-item{color label}` per `classDef`, using the same
color token the `classDef` resolves to:

````
:::legend
```mermaid
flowchart TD
  auth["Auth Service"]:::svc
  cache["Cache"]:::infra
  classDef svc fill:var(--c-primary-bg),stroke:var(--c-primary),color:var(--c-primary-text)
  classDef infra fill:var(--c-gray-bg),stroke:var(--c-gray),color:var(--c-gray-text)
```
::legend-item{color=primary label="Service"}
::legend-item{color=gray label="Infrastructure"}
:::
````

Renders as a collapsible panel in the diagram's top-left, row or column by aspect ratio. One
diagram per block; no items, no panel. In `:::explorer`, wrap the pinned fence the same way
and the legend pins with it. `color`: `primary success warning danger info gray low purple
teal pink cyan` (or hex for the legend swatch; never hex in a `classDef`), default `gray`.

Exempt: diagrams that never get a `classDef` (`sequenceDiagram`, `erDiagram`, …). Nothing to
color, nothing to legend.
