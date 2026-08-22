---
name: mermaid-diagrams
description: >
  Diagram design judgment — which mermaid diagram type to use, how to lay it out so it's
  actually readable, and how to label it — for any diagram you draw, anywhere: a
  `:::explorer` block, a plain mermaid fence in a plan file or PR description, a doc, or
  a quick answer in chat before it gets written to a file. Use this whenever asked to
  draw, diagram, visualize, map out, chart, or sketch a flow, architecture, pipeline,
  call sequence, data model, state machine, or process — even if the user never says
  "mermaid" or "diagram" (e.g. "show me how the request flows through these services",
  "visualize this architecture", "map out the call chain", "what does this pipeline look
  like end to end"). Also use this to sanity-check a diagram someone else drew — wrong
  diagram type, unreadable layout, and inconsistent labels are the most common defects.
  This skill owns diagram *design*, not `:::explorer` *syntax* — for that block's exact
  grammar (`{#id}` pairing, pin position, colors-as-classDef), consult blueprint-markdown too;
  the two are meant to be used together whenever the diagram is going into an explorer block.
---

# Mermaid Diagram Best Practices

Pick the diagram type that matches the question, then make it legible. A diagram that's
valid mermaid but the wrong type, or unreadable once rendered, is just prose with extra
syntax.

Writing a `:::explorer` block? Load **blueprint-markdown** too — it owns the directive
grammar (`{#id}`, `{pin}`, `{width}`) and the content rules (per-node detail section,
"Simplified" notes, "Not shown" list, colors/groups). This skill decides
the diagram underneath that wrapper. Pairing is by node id, not number: `auth["Auth
Service"]` pairs with `### Auth Service {#auth}` — no anchor, no error, just a dead box.
Only `flowchart`, `stateDiagram-v2`, and `classDiagram` support this linking (§2a covers
the rest).

## 0. Should this even be a diagram?

- Linear flow, no branches → numbered list.
- Matrix of options/attributes → table.
- 2-node relationship → one sentence.
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

- Timing/ordering between actors → `sequenceDiagram`, not flowchart.
- Static topology (calls exist, but order isn't the point) → still `flowchart`.
- Always `flowchart`, never the legacy `graph` alias — same renderer, but mixing them
  invites inconsistency.

## 2. Layout & readability

**Direction is about aspect ratio, not diagram type.** Estimate two numbers from the
edges: **L** (nodes on the longest path) and **W** (widest fan-out). `LR` renders L as
width, W as height; `TD` swaps them.

| L vs W | Direction |
|---|---|
| L > W (chain/pipeline) | **`TD`** — `LR` would be an unreadable strip |
| W > L (fan-out/hierarchy/hub) | **`LR`** — `TD` would be an unreadable band |
| L ≈ W | either, default `TD` |

Long axis goes vertical — pages scroll down, and `:::explorer{pin=left}` is a narrow
column. Ten stages stacked `TD` stay readable; the same ten in `LR` shrink to unreadable
labels. When the numbers disagree with what the diagram "sounds like" (a pipeline
"should" be horizontal), follow the numbers.

> **Don't fix a shape with `direction` inside a subgraph** — mermaid only honors a
> subgraph's own `rankdir` when no edge crosses its boundary; any external edge flips it
> back to the parent direction, silently. Only isolated groups (nothing crossing in or out)
> can use it — for a color key specifically, use `:::legend` (§4) instead of an isolated
> subgraph; it doesn't take up graph layout space at all.

- Group with `subgraph` — the main lever on legibility (not aspect ratio), for real
  grouping, not just a visual box. If `classDef` declares groups the graph doesn't have as
  subgraphs, promote them.
- Cap ~15-20 nodes (plain) or ~10-12 (`:::explorer`, since each node needs a detail
  section). Watch edge density (40 edges on 14 nodes is a hairball) and fan-in (8+
  incoming edges needs its own subgraph, not more arrows).
- Splitting into parent + detail diagrams: cut at a subsystem boundary, title each
  detail diagram after the node it expands, list what's hidden in the parent's "Not shown".
- Order nodes so related ones sit adjacent, to cut edge crossings; route shared edges
  through a middle node instead of crossing lanes.
- Cap ~5-6 outgoing edges per node — more means it's doing too much or needs a subgraph.
- For `:::explorer`, pick `pin` and direction together: `{pin=left}` is narrow (needs a
  tall shape), `{pin=top}` is wide (needs a short one).
- **Color is the default, not an opt-in.** Once a diagram clears §0's bar, give it `classDef`
  color — any diagram, not only `:::explorer`; the default theme coloring being fine is not a
  reason to skip it. Use the shared token triad, never a solid saturated fill with no stroke:
  `classDef role fill:var(--c-role-bg),stroke:var(--c-role),color:var(--c-role-text)` (see
  blueprint-markdown's color tokens). Vary lightness, not just hue, for colorblind-safe fills.
  `classDef` for 2+ nodes sharing a category, `style` only for a genuine one-off. **Every
  color gets a legend, no size exception — see §4.**
- Two more channels, independent of hue: `stroke-width:2px` for emphasis (the critical or
  happy path), `stroke-dasharray:4 3` for state (planned/inactive vs. active) — both still
  read in grayscale or under a colorblind palette.
- Edges take color too, not just nodes: `linkStyle <n> stroke:var(--c-role),stroke-width:2px`
  marks a specific edge (an error path, the one dependency that matters) — `<n>` is the
  edge's 0-based position in source order.
- `sequenceDiagram`, `erDiagram`, and other non-flowchart types skip all of the above —
  see §2a.

## 2a. Type-specific notes

**sequenceDiagram**
- Declare every `participant` up front in left-to-right render order — otherwise order
  follows first mention and reshuffles as calls are added.
- `->>` (solid) = call, `-->>` (dashed) = return. Don't reuse solid for both.
- Use `alt`/`opt`/`loop` for branching/repetition instead of near-duplicate flows.
- Cap ~5-7 participants; split by sub-flow past that.
- Never links in `:::explorer` — mermaid drops participant ids at render (`actor0`,
  `actor1`), so `{#id}` has nothing to match. Still pins and renders fine.

**erDiagram**
- Cardinality reads left-to-right (`||--o{` = "exactly one to zero-or-many") — double
  check which side each symbol is on.
- Never links in `:::explorer` — entity aliases are a parse error, so the displayed name
  is the raw id with no way to relabel it.

**classDiagram / stateDiagram-v2**
- Both link. Keep the id for pairing, put readable text in the label:
  `class auth["Auth Service"]` / `auth : Auth Service`, paired with
  `### Auth Service {#auth}`.

**stateDiagram-v2**
- Always show `[*]` start (and end, if any) — otherwise it reads as an unordered list of
  boxes.

## 3. Labeling

- Quote every label. Inside quotes: escape `<`/`>` (wrap generics like `Array<T>`), use
  `#quot;` for a literal `"`, use `<br/>` for line breaks. Outside quotes: never name a
  node `end` (terminates the parser), never start an id with `o`/`x` (parsed as an edge
  modifier).
- Node labels: short noun phrases (`Auth Service`), no undefined abbreviations, short
  enough to stand alone — someone skimming just the labels, not the whole diagram, should
  still get the point.
- Node subtitle: when the title alone doesn't convey the node's role, add a short second
  line inside the same label (`svc_auth["Auth Service<br/><i>issues JWTs</i>"]`) — a few
  words, not a sentence.
- `<b>text</b>` bolds part of a label the same way `<i>` above italicizes it — confirmed to
  render as real bold under this codebase's `securityLevel:'strict'` config, not stripped or
  shown literally. `==highlight==` does **not** work here — confirmed to render as literal
  `==text==` inside a label; it only applies to surrounding prose (`:::explorer` detail
  sections, `:::legend` captions, callout bodies), never inside `["..."]`.
- Edge labels: verb phrases (`writes to`, `validates`), not nouns — give every arrow one;
  an unlabeled edge leaves the relationship to guesswork.
- Keep edge labels short; if one genuinely needs more words,
  break it across lines with `<br/>`.
- Stay consistent — don't call the same relationship "calls" in one place and "invokes"
  elsewhere in the same diagram.
- Short, stable ids (`svc_auth`) with the readable text in the label
  (`svc_auth["Auth Service"]`). In `:::explorer`, the id is also the pairing key —
  renaming it breaks its detail link unless the `{#id}` anchor changes too.

## 4. Legend

**Every `classDef`/`style` color needs a legend entry, no size exception** — a reader can't
distinguish "styled for emphasis" from "styled because it's a failure state" without one, and
that's just as true for one colored node as for five. Wrap the diagram in `:::legend` and add
one `::legend-item{color=... label="..."}` per `classDef`, using the exact same color token the
`classDef` itself resolves to (never a different token, or the legend and the diagram drift
apart):

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

It renders as a panel in the diagram's top-left corner, shown expanded by default — click to
collapse it to a small button, click again to expand — laid out in a row for a wide chart or a
column for a tall one. This is a `blueprint-markdown` directive, not mermaid syntax; see that
skill's `:::legend` entry for the full attribute reference.

The only diagrams exempt are the ones that never get a `classDef` in the first place —
`sequenceDiagram`, `erDiagram`, and the other types §2a already excludes from color. Nothing to
color means nothing to legend; it isn't a size-based opt-out.