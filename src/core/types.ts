// Shared types for the blueprint-markdown core engine.
// Filled progressively as milestones 3–6 implement each module.

export type Form = 'container' | 'leaf' | 'inline'

export interface Attrs {
  /** Named key=value attributes */
  named: Record<string, string>
  /** .class values */
  classes: string[]
  /** #id value */
  id?: string
  /** Boolean flags (present = true) */
  flags: Set<string>
  /** Single bare primary argument, e.g. {red} or {70} */
  primary?: string
}

export interface TextNode {
  type: 'text'
  lines: string[]
}

export interface DirectiveNode {
  type: 'directive'
  form: Form
  name: string
  attrs: Attrs
  /** Container body (directive + text nodes interleaved) */
  children?: ASTNode[]
  /** Inline directive visible text, e.g. :chip[Active] */
  text?: string
  /** false when container was closed by EOF rather than ::: */
  closed?: boolean
}

export type ASTNode = TextNode | DirectiveNode

export interface RenderCtx {
  /** Recursively render a directive node's children to an HTML string */
  renderChildren: (node: DirectiveNode) => string
  /** Render a markdown string as inline HTML (no block wrapping) */
  renderInline: (md: string) => string
  /** Escape a string for safe HTML attribute / text interpolation */
  esc: (s: string) => string
  /** Resolve a color token (primary/success/…) or hex string to a CSS value */
  resolveColor: (token?: string) => string | undefined
}

export interface DirectiveSpec {
  forms: Form[]
  render: (node: DirectiveNode, ctx: RenderCtx) => string
}

export interface CoreOptions {
  /** Extra or replacement registry entries */
  directives?: Record<string, DirectiveSpec>
  /** Override the default color palette */
  palette?: Record<string, string>
  /** markdown-it options */
  markdownItOptions?: Record<string, unknown>
}
