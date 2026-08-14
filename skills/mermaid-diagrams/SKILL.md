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
> back to the parent direction, silently. Only isolated groups (e.g. a legend) can use it.

- Group with `subgraph` — the main lever on legibility (not aspect ratio). If `classDef`
  declares groups the graph doesn't have as subgraphs, promote them.
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
- Color: set `color:` explicitly in `classDef` (renderer defaults break in dark themes).
  Vary lightness, not just hue, for colorblind-safe fills. `classDef` for 2+ nodes
  sharing a category, `style` only for a genuine one-off.
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
- Node labels: short noun phrases (`Auth Service`), no undefined abbreviations. Prefer
  a description short enough to stand alone — someone skimming just the
  labels, not the whole diagram, should still get the point.
- Edge labels: verb phrases (`writes to`, `validates`), not nouns. Prefer
  giving every arrow one — an unlabeled edge leaves the relationship to guesswork.
- Prefer keeping edge labels short; if one genuinely needs more words,
  break it across lines with `<br/>`.
- Stay consistent — don't call the same relationship "calls" in one place and "invokes"
  elsewhere in the same diagram.
- Short, stable ids (`svc_auth`) with the readable text in the label
  (`svc_auth["Auth Service"]`). In `:::explorer`, the id is also the pairing key —
  renaming it breaks its detail link unless the `{#id}` anchor changes too.