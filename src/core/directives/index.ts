/**
 * directives/index.ts — Assembles the default directive registry.
 *
 * Each feature lives in its own file and exports a partial registry or
 * individual entries. This file merges them all.
 *
 * "Adding a feature" = add a file under directives/, export its entries,
 * and register them here. Grammar and parser never change.
 */

import type { DirectiveSpec } from '../types'
import { cardDirectives } from './card'
import { calloutDirectives } from './callout'
import { disclosureDirectives } from './disclosure'
import { layoutDirectives } from './layout'
import { timelineDirectives } from './timeline'
import { tabsDirectives } from './tabs'
import { stepsDirectives } from './steps'
import { progressDirectives } from './progress'
import { inlineWidgetDirectives } from './inline-widgets'
import { revisionDirectives } from './revision'
import { mindmapDirectives } from './mindmap'
import { explorerDirectives } from './explorer'

export type Registry = Record<string, DirectiveSpec>

/** Build the default registry, optionally merged with custom overrides. */
export function buildRegistry(overrides?: Record<string, DirectiveSpec>): Registry {
  const base: Registry = {
    ...cardDirectives,
    ...calloutDirectives,
    ...disclosureDirectives,
    ...layoutDirectives,
    ...timelineDirectives,
    ...tabsDirectives,
    ...stepsDirectives,
    ...progressDirectives,
    ...inlineWidgetDirectives,
    ...revisionDirectives,
    ...mindmapDirectives,
    ...explorerDirectives,
  }
  if (overrides) {
    return { ...base, ...overrides }
  }
  return base
}

/**
 * Helper to create an alias entry — routes to a target directive
 * with preset attribute overrides merged in at render time.
 * Used for the 6 named callout variants (note, tip, info, warning, danger, success).
 */
export function alias(
  targetName: string,
  presetAttrs: Record<string, string>,
  registry: Registry,
): DirectiveSpec {
  return {
    forms: ['container'],
    render(node, ctx) {
      const target = registry[targetName]
      if (!target) return `<!-- alias target "${targetName}" not found -->`
      // Merge preset attrs into the node's named attrs (preset has lower priority)
      const mergedNode = {
        ...node,
        attrs: {
          ...node.attrs,
          named: { ...presetAttrs, ...node.attrs.named },
        },
      }
      return target.render(mergedNode, ctx)
    },
  }
}
