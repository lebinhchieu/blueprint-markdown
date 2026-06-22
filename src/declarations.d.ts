// Type declarations for packages without @types/* definitions

declare module 'markdown-it-mark'
declare module 'markdown-it-task-lists'
declare module 'mermaid' {
  interface MermaidConfig {
    startOnLoad?: boolean
    securityLevel?: string
    theme?: string
    themeVariables?: Record<string, unknown>
  }
  interface RunOptions {
    nodes: HTMLElement[]
  }
  function initialize(config: MermaidConfig): void
  function run(options: RunOptions): Promise<void>
  const _default: {
    initialize: typeof initialize
    run: typeof run
  }
  export default _default
}
