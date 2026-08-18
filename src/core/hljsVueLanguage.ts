/**
 * hljsVueLanguage.ts — highlight.js grammar for Vue single-file components.
 *
 * highlight.js ships no `vue` language, and the community package
 * (`highlightjs-vue` on npm) is broken as a published module — its dist
 * files assign the definition to a locally-shadowed `module$1.exports`
 * instead of the real `module.exports`, so importing it returns `{}`.
 *
 * Vendored from https://github.com/highlightjs/highlightjs-vue (CC0-1.0),
 * unchanged apart from TypeScript types.
 */

import type { HLJSApi, Language } from 'highlight.js'

export function hljsDefineVue(hljs: HLJSApi): Language {
  return {
    subLanguage: 'xml',
    contains: [
      hljs.COMMENT('<!--', '-->', { relevance: 10 }),
      {
        begin: /^(\s*)(<script>)/gm,
        end: /^(\s*)(<\/script>)/gm,
        subLanguage: 'javascript',
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(\s*)(<script lang=["']ts["']>)/gm,
        end: /^(\s*)(<\/script>)/gm,
        subLanguage: 'typescript',
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(\s*)(<style(\sscoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: 'css',
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(\s*)(<style lang=["'](scss|sass)["'](\sscoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: 'scss',
        excludeBegin: true,
        excludeEnd: true,
      },
      {
        begin: /^(\s*)(<style lang=["']stylus["'](\sscoped)?>)/gm,
        end: /^(\s*)(<\/style>)/gm,
        subLanguage: 'stylus',
        excludeBegin: true,
        excludeEnd: true,
      },
    ],
  }
}
