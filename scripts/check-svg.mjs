/**
 * check-svg.mjs — corpus / property checks for src/core/svgSanitize.ts.
 * Hostile corpus, realistic round-trip, idempotence (modulo scope), determinism,
 * independent re-scan (own tables, nothing imported from the sanitizer), seeded
 * mutation fuzz, perf and size limits. Exit != 0 on any failure.
 *
 * Run: node scripts/check-svg.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import * as esbuild from 'esbuild'

if (!fs.existsSync('dist')) fs.mkdirSync('dist', { recursive: true })
const tmp = path.resolve('dist', '.tmp-svgsanitize.cjs')
await esbuild.build({
  entryPoints: ['src/core/svgSanitize.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: tmp, logLevel: 'silent',
})
const { sanitizeSvg, SVG_MAX_BYTES } = createRequire(import.meta.url)(tmp)
fs.rmSync(tmp)

let failures = 0
let checks = 0
const fail = (msg) => { failures++; console.error('FAIL', msg) }
const ok = (cond, msg) => { checks++; if (!cond) fail(msg) }

// ───────── independent re-scan (own tables) ─────────
const R_TAGS = new Set(('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textpath title desc ' +
  'lineargradient radialgradient stop pattern clippath mask marker filter fegaussianblur fedropshadow feoffset feflood ' +
  'femerge femergenode fecomposite style image').split(' '))
const R_ATTRS = new Set(('x y width height cx cy r rx ry x1 y1 x2 y2 points d pathlength dx dy rotate textlength lengthadjust refx refy ' +
  'markerwidth markerheight markerunits orient viewbox preserveaspectratio transform fx fy fr gradientunits gradienttransform ' +
  'spreadmethod patternunits patterncontentunits patterntransform clippathunits maskunits maskcontentunits primitiveunits ' +
  'filterunits offset startoffset method spacing side fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin ' +
  'stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color stop-color stop-opacity flood-color flood-opacity ' +
  'clip-path clip-rule mask filter marker-start marker-mid marker-end paint-order visibility display vector-effect shape-rendering ' +
  'text-rendering color-interpolation color-interpolation-filters font-family font-size font-weight font-style font-variant ' +
  'font-stretch text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing word-spacing text-decoration ' +
  'writing-mode direction unicode-bidi stddeviation in in2 result mode operator k1 k2 k3 k4 role aria-label aria-labelledby ' +
  'aria-hidden xml:space id class style href').split(' '))

function rescan(html, label) {
  const bad = (m) => fail(`rescan[${label}]: ${m}\n  ${html.slice(0, 300)}`)
  checks++
  if (!/^<svg[\s>]/.test(html) || !html.endsWith('</svg>')) return bad('not <svg>…</svg>')
  if (/<script|<!|<\?/i.test(html)) return bad('forbidden marker')
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:[^>"]|"[^"]*")*)>/g
  let m
  let consumed = 0
  while ((m = tagRe.exec(html))) {
    const [, , name, rest] = m
    if (!R_TAGS.has(name.toLowerCase())) return bad(`tag ${name}`)
    const attrRe = /\s+([^\s=]+)="([^"]*)"/g
    let a
    let used = 0
    while ((a = attrRe.exec(rest))) {
      used += a[0].length
      const an = a[1].toLowerCase()
      const val = a[2]
      if (!R_ATTRS.has(an) || /^on/.test(an)) return bad(`attr ${an}`)
      if (an === 'href' && !/^#[\w.-]+$/.test(val) && !(name.toLowerCase() === 'image' && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+\/]+={0,2}$/.test(val))) return bad(`href ${val.slice(0, 80)}`)
      if (/url\(/i.test(val) && !/^(?:[^u]|u(?!rl\())*(?:url\(#[\w.-]+\)(?:[^u]|u(?!rl\())*)+$/i.test(val)) return bad(`url ${val}`)
      if (/javascript:|https?:|expression|@import|&#|\\/i.test(val) && an !== 'aria-label') return bad(`value ${val}`)
      if (/data:/i.test(val) && an !== 'aria-label' && !(an === 'href' && name.toLowerCase() === 'image')) return bad(`value ${val}`)
    }
    if (used !== rest.length) return bad(`unparsed attr text: ${rest}`)
    consumed++
  }
  // style bodies: only our scoped rules; nothing external
  for (const s of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    if (/@|url\((?!#)|\\|expression|javascript|https?:|<|&(?!amp;|lt;|gt;)/i.test(s[1])) return bad(`style ${s[1]}`)
  }
  // leftover text (tags removed): no raw < or >, only safe entities
  const left = html.replace(tagRe, '')
  if (/[<>]/.test(left.replace(/<style>[\s\S]*?<\/style>/g, '')) || /&(?!amp;|lt;|gt;|quot;)/.test(left)) return bad('unescaped text')
  if (consumed === 0) return bad('no tags')
}

// idempotence modulo scope + determinism
function normScope(html, scope) {
  return html.split(`.${scope} `).join('').split(`${scope}-`).join('')
}
function checkProps(label, src) {
  const r1 = sanitizeSvg(src)
  const r1b = sanitizeSvg(src)
  ok(JSON.stringify(r1) === JSON.stringify(r1b), `determinism ${label}`)
  if (!r1.ok) return r1
  rescan(r1.html, label)
  const r2 = sanitizeSvg(r1.html)
  if (!r2.ok) { fail(`idempotence ${label}: pass 2 error ${JSON.stringify(r2.error)}`); return r1 }
  rescan(r2.html, label + '/pass2')
  const n1 = normScope(r1.html, r1.scope)
  const n2 = normScope(normScope(r2.html, r2.scope), r1.scope)
  ok(n1 === n2, `idempotence ${label}\n  1: ${n1.slice(0, 200)}\n  2: ${n2.slice(0, 200)}`)
  return r1
}

const S = (inner) => `<svg viewBox="0 0 10 10">${inner}</svg>`
const R = '<rect x="1" y="1" width="5" height="5"/>'

// ───────── hostile corpus ─────────
// [name, src, assert(res) → bool|undefined]
const hostile = [
  ['script element', S(`<script>window.__pwned=1</script>${R}`), (r) => r.ok && !/script|pwned/.test(r.html) && /<rect/.test(r.html)],
  ['script CDATA', S(`<script><![CDATA[window.__pwned=1]]></script>${R}`), (r) => r.ok && !/pwned/.test(r.html)],
  ['script with < in body', S(`<script>if(a<b){x()}</script>${R}`), (r) => r.ok && !/pwned|if\(/.test(r.html)],
  ['onload on root', `<svg viewBox="0 0 9 9" onload="alert(1)">${R}</svg>`, (r) => r.ok && !/onload|alert/i.test(r.html)],
  ['ONCLICK upper + entity ws', S(`<rect ONCLICK="alert(1)" x="1" y="1" width="2" height="2" onmouseover = "x()"/>`), (r) => r.ok && !/onclick|alert|onmouse/i.test(r.html)],
  ['foreignObject', S(`<foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject>${R}`), (r) => r.ok && !/foreign|iframe/i.test(r.html)],
  ['iframe object embed', S(`<iframe src="x"></iframe><object data="x"></object><embed src="x"/>${R}`), (r) => r.ok && !/iframe|object|embed/i.test(r.html)],
  ['image external', S(`<image href="https://evil.test/a.png"/>${R}`), (r) => r.ok && !/image|evil/.test(r.html)],
  ['use external href', S(`<use href="https://evil.test/x.svg#a"/>${R}`), (r) => r.ok && !/evil/.test(r.html)],
  ['use data: href', S(`<use xlink:href="data:image/svg+xml;base64,PHN2Zz4="/>${R}`), (r) => r.ok && !/data:/.test(r.html)],
  ['a javascript: href', S(`<a href="javascript:alert(1)"><text x="1" y="5">keep me</text></a>`), (r) => r.ok && /keep me/.test(r.html) && !/javascript|<a[\s>]/i.test(r.html)],
  ['a https href unwrapped', S(`<a xlink:href="https://x.test"><text x="1" y="5">link text</text></a>`), (r) => r.ok && /link text/.test(r.html) && !/x\.test|<a[\s>]/.test(r.html)],
  ['entity-obfuscated javascript', S(`<a href="java&#x09;script:alert(1)"><text x="1" y="1">t</text></a><use href="jav&#x61;script:alert(1)"/>`), (r) => r.ok && !/script|alert/i.test(r.html)],
  ['entity-encoded href tab/newline', S(`<use href="&#x6A;avascript&#58;alert(1)"/>${R}`), (r) => r.ok && !/javascript/i.test(r.html)],
  ['style @import', S(`<style>@import url(https://evil.test/x.css); .a{fill:red}</style>${R}`), (r) => r.ok && !/import|evil/.test(r.html)],
  ['style url(http)', S(`<style>.a{fill:url(https://evil.test/x)}</style>${R}`), (r) => r.ok && !/evil/.test(r.html)],
  ['style attr url/expression', S(`<rect style="fill:url(http://evil.test);width:expression(alert(1))" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/evil|expression/.test(r.html)],
  ['style attr background', S(`<rect style="background:url(//e.test);position:fixed;fill:red" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/background|position|e\.test/.test(r.html) && /fill:red/.test(r.html)],
  ['CSS escape \\75rl(', S(`<rect style="fill:\\75rl(http://e.test)" x="1" y="1" width="3" height="3"/><style>.a{fill:\\75rl(http://e.test)}</style>`), (r) => r.ok && !/e\.test|\\/.test(r.html)],
  ['presentation attr url(http)', S(`<rect fill="url(http://e.test/a)" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/e\.test/.test(r.html)],
  ['SMIL set href', S(`<a><set attributeName="href" to="javascript:alert(1)"/><text x="1" y="1">t</text></a>`), (r) => r.ok && !/set|attributeName|alert/.test(r.html)],
  ['SMIL animate', S(`<rect x="1" y="1" width="3" height="3"><animate attributeName="x" from="0" to="9" dur="1s"/><animateTransform type="rotate"/></rect>`), (r) => r.ok && !/animate/.test(r.html)],
  ['switch/view/feImage', S(`<switch><rect x="1" y="1" width="2" height="2"/></switch><view id="v"/><filter id="f"><feImage href="http://e.test/a"/></filter>${R}`), (r) => r.ok && !/switch|<view|feImage|e\.test/.test(r.html)],
  ['svg:script namespaced', S(`<svg:script>alert(1)</svg:script>${R}`), (r) => r.ok && !/script|alert/.test(r.html)],
  ['x:script xmlns', S(`<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>${R}`), (r) => r.ok && !/script|alert/.test(r.html)],
  ['DOCTYPE + ENTITY', `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 9 9"><text x="1" y="5">&xxe;</text></svg>`, (r) => r.ok && !/passwd|file:/.test(r.html)],
  ['billion laughs', `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg viewBox="0 0 9 9"><text x="1" y="5">&b;</text></svg>`, (r) => r.ok && r.html.length < 400],
  ['comment-wrapped script', S(`<!-- <script>alert(1)</script> -->${R}<!--x-->`), (r) => r.ok && !/script|alert/.test(r.html)],
  ['mixed-case tags', `<SvG viewBox="0 0 9 9"><ScRiPt>alert(1)</ScRiPt><RECT x="1" y="1" width="3" height="3"/></SvG>`, (r) => r.ok && /<rect/.test(r.html) && !/script/i.test(r.html)],
  ['mixed-case canonical', `<svg viewbox="0 0 9 9"><CLIPPATH id="c"><RECT x="1" y="1" width="3" height="3"/></CLIPPATH><LINEARGRADIENT id="g"/></svg>`, (r) => r.ok && /clipPath/.test(r.html) && /viewBox/.test(r.html) && /linearGradient/.test(r.html)],
  ['unclosed tag', S(`<g><rect x="1" y="1" width="3" height="3">`), (r) => !r.ok && r.error.kind === 'malformed'],
  ['mismatched tags', S(`<g><rect x="1" y="1" width="3" height="3"></g></rect>`), (r) => !r.ok && r.error.kind === 'malformed'],
  ['unterminated attr quote', `<svg viewBox="0 0 9 9"><rect x="1 y="1" width="3" height="3"/></svg>`, (r) => !r.ok],
  ['unquoted attr', `<svg viewBox="0 0 9 9"><rect x=1 y="1" width="3" height="3"/></svg>`, (r) => !r.ok && r.error.kind === 'malformed'],
  ['break out </svg><script>', `<svg viewBox="0 0 9 9">${R}</svg><script>alert(1)</script>`, (r) => !r.ok && r.error.kind === 'not-svg'],
  ['break out inside title', S(`<title></title></svg><script>alert(1)</script><svg>${R}`), (r) => !r.ok || !/script|alert/.test(r.html)],
  ['nested svg in title', S(`<title><svg><script>alert(1)</script></svg>t</title>${R}`), (r) => r.ok && !/script|alert/.test(r.html) && /<title>t<\/title>/.test(r.html)],
  ['nested svg in desc', S(`<desc><svg onload="alert(1)"><circle r="1"/></svg>d</desc>${R}`), (r) => r.ok && !/onload|alert|<circle/.test(r.html)],
  ['title style mXSS', S(`<title><style>*{x:y}</style><img src=x onerror=alert(1)></title>${R}`), (r) => !r.ok || !/onerror|<img|<style/.test(r.html)],
  ['text with markup entities', S(`<text x="1" y="5">&lt;img src=x onerror=alert(1)&gt; &#60;script&#62;</text>`), (r) => r.ok && !/<img|<script/.test(r.html) && /&lt;img/.test(r.html)],
  ['CDATA text escaped', S(`<text x="1" y="5"><![CDATA[<img src=x onerror=alert(1)>]]></text>`), (r) => r.ok && !/<img/.test(r.html)],
  ['leading-combinator style', S(`<style>~ div{display:none} + p{display:none} > a{x:y} .a ~ .b{fill:red}</style>${R}`), (r) => r.ok && !/~|\+/.test(r.html)],
  ['body{display:none} scoped', S(`<style>body{display:none} .box{fill:red}</style>${R}`), (r) => r.ok && /\.s\w+ body\{display:none\}/.test(r.html) && !/(^|[>}\s])body\{/.test(r.html.replace(/\.s\w+ body\{/g, ''))],
  ['style html/*/:root', S(`<style>html{display:none}*{display:none}:root{display:none}svg{display:none}</style>${R}`), (r) => r.ok && [...r.html.matchAll(/<style>([\s\S]*?)<\/style>/g)].every((m) => m[1].split('\n').every((l) => l.startsWith('.' + r.scope + ' '))) && !/:root/.test(r.html)],
  ['style @keyframes/@media/@font-face', S(`<style>@keyframes a{from{x:1}} @media print{.a{fill:red}} @font-face{font-family:x;src:url(http://e.test)} .ok{fill:blue}</style>${R}`), (r) => r.ok && !/keyframes|media|font-face|e\.test/.test(r.html) && /fill:blue/.test(r.html)],
  ['style animation/position/cursor/pointer-events', S(`<style>.a{animation:x 1s;position:fixed;z-index:9;cursor:pointer;pointer-events:all;content:"x";fill:red}</style>${R}`), (r) => r.ok && !/animation|position|z-index|cursor|pointer|content/.test(r.html) && /fill:red/.test(r.html)],
  ['style attr+rule position/z-index/overflow/contain/pointer-events/margin dropped', S(`<rect style="position:absolute;z-index:9;overflow:visible;contain:none;pointer-events:all;margin:-999px;fill:red" x="1" y="1" width="3" height="3"/><style>.a{position:fixed;z-index:9;overflow:visible;contain:none;pointer-events:all;margin:-999px;fill:blue}</style>${R}`), (r) => r.ok && !/position|z-index|overflow|contain|pointer|margin/.test(r.html) && /fill:red/.test(r.html) && /fill:blue/.test(r.html)],
  ['use chain amplification', S(`<defs><g id="a"><rect x="1" y="1" width="2" height="2"/></g><g id="b">${'<use href="#a"/>'.repeat(10)}</g><g id="c">${'<use href="#b"/>'.repeat(10)}</g></defs><use href="#c"/>`), (r) => !r.ok && r.error.kind === 'too-complex'],
  ['use self-containing', S(`<g id="a"><use href="#a"/><rect x="1" y="1" width="2" height="2"/></g>`), (r) => !r.ok && r.error.kind === 'too-complex'],
  ['use is own target', S(`<use id="a" href="#a"/>${R}`), (r) => !r.ok && r.error.kind === 'too-complex'],
  ['use legit reuse', S(`<defs><g id="a"><rect x="1" y="1" width="2" height="2"/><circle cx="3" cy="3" r="1"/><path d="M0 0L1 1"/></g></defs>${'<use href="#a"/>'.repeat(5)}`), (r) => r.ok && (r.html.match(/<use /g) || []).length === 5],
  ['attr()/env() in style=, rule, presentation attr', S(`<rect style="fill:attr(aria-label url)" x="1" y="1" width="3" height="3"/><style>.a{fill:env(x);stroke:attr(x)}.b{fill:blue}</style><rect fill="attr(aria-label url)" x="1" y="1" width="3" height="3"/><rect fill="env(safe-area-inset-top)" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/attr\(|env\(/.test(r.html) && /fill:blue/.test(r.html)],
  ['entity &constructor; inherited key', S(`<text>&constructor;&__proto__;&toString;&hasOwnProperty;</text>${R}`), (r) => r.ok && !/native code|\[object/.test(r.html)],
  ['multibyte over byte cap', '<svg viewBox="0 0 1 1">' + R + '<desc>' + '€'.repeat(90000) + '</desc></svg>', (r) => !r.ok && r.error.kind === 'too-large'],
  ['style output expansion cap', S(`<style>${'.a{fill:red}'.repeat(1)}${'.a,'.repeat(80000)}.b{fill:red}</style>${R}`), (r) => !r.ok || r.html.length <= 512 * 1024],
  ['closed-nested var perf', S(`<rect style="fill:${'var(--a,'.repeat(7000)}red${')'.repeat(7000)}" x="1" y="1" width="3" height="3"/>`), (r) => !r.ok || !/var\(--a,var/.test(r.html)],
  ...['png', 'gif', 'jpeg', 'webp'].flatMap((m) => ['href', 'xlink:href'].map((h) => [`image ${m} ${h}`, S(`<image ${h}="data:image/${m};base64,iVBORw0KGgo=" x="1" y="1" width="4" height="4"/>${R}`), (r) => r.ok && r.html.includes(`<image `) && r.html.includes(`href="data:image/${m};base64,iVBORw0KGgo="`) && !/xlink/.test(r.html)])),
  ['image upper-case mime, ws/tab in body', S(`<image href="DATA:IMAGE/PNG;BASE64,iVBO&#9;Rw0K Ggo=" width="4" height="4"/>${R}`), (r) => r.ok && r.html.includes('href="data:image/png;base64,iVBORw0KGgo="')],
  ['image in defs/pattern', S(`<defs><pattern id="p" width="4" height="4"><image href="data:image/gif;base64,R0lGODlh" width="4" height="4"/></pattern></defs>${R}`), (r) => r.ok && r.html.includes('data:image/gif')],
  ...[
    ['svg+xml', 'data:image/svg+xml;base64,PHN2Zz4='], ['text/html', 'data:text/html;base64,PGI+'], ['octet-stream', 'data:application/octet-stream;base64,AAAA'],
    ['non-base64', 'data:image/png,abcd'], ['charset', 'data:image/png;charset=utf-8;base64,AAAA'], ['http', 'http://e.test/a.png'], ['https', 'https://e.test/a.png'],
    ['relative', 'a.png'], ['protocol-rel', '//e.test/a.png'], ['javascript', 'javascript:alert(1)'], ['id', '#a'], ['entity-obf svg', 'data:image/s&#118;g+xml;base64,PHN2Zz4='],
    ['tab-obf html', 'da\tta:text/html;base64,PGI+'], ['bad len', 'data:image/png;base64,AAA'], ['quote in body', 'data:image/png;base64,AA&quot;AA'], ['lt in body', 'data:image/png;base64,AA&lt;A'],
    ['empty body', 'data:image/png;base64,'], ['pad middle', 'data:image/png;base64,AA=AAAAA'],
  ].map(([nm, v]) => [`image invalid: ${nm}`, S(`<image href="${v}" width="4" height="4"/>${R}`), (r) => r.ok && !/<image|data:|e\.test|javascript/i.test(r.html)]),
  ['image children dropped', S(`<image href="data:image/png;base64,AAAA" width="2" height="2"><rect id="k"/><script>x</script></image>${R}`), (r) => r.ok && r.html.includes('<image ') && !/id="[^"]*-k"/.test(r.html)],
  ['data: on use/other dropped', S(`<use href="data:image/png;base64,AAAA"/><linearGradient id="g" href="data:image/png;base64,AAAA"/>${R}`), (r) => r.ok && !/data:/.test(r.html)],
  ['feImage dropped', S(`<filter id="f"><feImage href="data:image/png;base64,AAAA"/></filter>${R}`), (r) => r.ok && !/feImage|data:/i.test(r.html)],
  ['image 200KB valid', S(`<image href="data:image/png;base64,${'A'.repeat(200000)}" width="4" height="4"/>${R}`), (r) => r.ok && r.html.includes('A'.repeat(1000))],
  ['quoted } in style value', S(`<style>.a{font-family:"}body{display:none";fill:red} .b{fill:blue}</style>${R}`), (r) => r.ok && !/(^|[^.\w ])body\{/.test(r.html.replace(/\.s\w+ body\{/g, '')) && !/display:none/.test(r.html)],
  ['quoted ; and newline in string', S(`<style>.a{font-family:"a;fill:red\n";x:y} .b{fill:blue}</style>${R}`), (r) => r.ok && !/fill:red/.test(r.html)],
  ['</style><script> inside style', S(`<style>.a{fill:red}</style><script>alert(1)</script>${R}`), (r) => r.ok && !/script|alert/.test(r.html)],
  ['style with selector tricks', S(`<style>a[href^="x"]{fill:red} .a::before{x:y} .a:not(.b){fill:red} div+p{fill:red} .c{fill:green}</style>${R}`), (r) => r.ok && !/\[|::|:not|\+/.test(r.html) && /fill:green/.test(r.html)],
  ['class mermaid / code-line / tab-panel', S(`<g class="mermaid code-line tab-panel em-explorer em-svg-fill-primary"><rect class="mermaid" x="1" y="1" width="3" height="3"/></g>`), (r) => r.ok && !/class="[^"]*(?:^|[ "])(mermaid|code-line|tab-panel|em-explorer)[ "]/.test(r.html) && /em-svg-fill-primary/.test(r.html) && !/ mermaid[ "]/.test(r.html.replace(/s\w+-mermaid/g, ''))],
  ['id with bad chars', S(`<rect id="a b" x="1" y="1" width="3" height="3"/><rect id="1x" x="1" y="1" width="3" height="3"/><rect id="&quot;onload=" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/id="[^"]*[ &]/.test(r.html)],
  ['var() injection', S(`<rect fill="var(--c-primary)" style="stroke:var(--x, url(http://e.test))" x="1" y="1" width="3" height="3"/><rect fill="var(--a, red" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/e\.test/.test(r.html) && /style="fill:var\(--c-primary\)"/.test(r.html)],
  ['data-* contenteditable tabindex target', S(`<rect data-x="1" contenteditable="true" tabindex="0" target="_top" xml:base="http://e.test/" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/data-|contenteditable|tabindex|target|xml:base|e\.test/.test(r.html)],
  ['xmlns stripped', `<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="http://e.test" viewBox="0 0 9 9">${R}</svg>`, (r) => r.ok && !/xmlns|e\.test|w3\.org/.test(r.html)],
  ['text outside root', `hello<svg viewBox="0 0 9 9">${R}</svg>`, (r) => !r.ok && r.error.kind === 'not-svg'],
  ['two roots', `<svg viewBox="0 0 9 9">${R}</svg><svg viewBox="0 0 9 9">${R}</svg>`, (r) => !r.ok && r.error.kind === 'not-svg'],
  ['not svg root', `<div>${R}</div>`, (r) => !r.ok && r.error.kind === 'not-svg' && r.error.tag === 'div'],
  ['not-svg tag name hostile', `<img"src=x onerror=alert(1)>`, (r) => !r.ok && (r.error.tag === undefined || /^[\w:.-]+$/.test(r.error.tag))],
  ['empty', '   \n ', (r) => !r.ok && r.error.kind === 'empty'],
  ['nothing to draw', `<svg viewBox="0 0 9 9"><script>alert(1)</script><g/></svg>`, (r) => !r.ok && r.error.kind === 'nothing-to-draw'],
  ['nothing to draw only defs', `<svg viewBox="0 0 9 9"><defs><linearGradient id="g"/></defs></svg>`, (r) => !r.ok && r.error.kind === 'nothing-to-draw'],
  ['too deep', '<svg>' + '<g>'.repeat(100) + R + '</g>'.repeat(100) + '</svg>', (r) => !r.ok && r.error.kind === 'too-complex'],
  ['too many attrs', `<svg viewBox="0 0 9 9"><rect ${Array.from({ length: 70 }, (_, i) => `a${i}="1"`).join(' ')}/></svg>`, (r) => !r.ok && r.error.kind === 'too-complex'],
  ['huge attr', `<svg viewBox="0 0 9 9"><path d="${'M0 0 '.repeat(14000)}"/></svg>`, (r) => !r.ok && r.error.kind === 'too-complex'],
  ['many elements', '<svg>' + '<rect/>'.repeat(20001) + '</svg>', (r) => !r.ok && r.error.kind === 'too-complex'],
  ['stray closer', `</g><svg viewBox="0 0 9 9">${R}</svg>`, (r) => !r.ok],
  ['control chars / null', S(`<text x="1" y="5">a\u0000b\u0007c</text><rect fill="red\u0000" x="1" y="1" width="3" height="3"/>`), (r) => r.ok && !/[\u0000-\u0008]/.test(r.html)],
  ['unknown entity literal', S(`<text x="1" y="5">&foo; &amp;lt; & x</text>`), (r) => r.ok && /&amp;foo;/.test(r.html)],
  ['title with markup entity', S(`<title>a &lt;b&gt; "q"</title>${R}`), (r) => r.ok && /<title>a &lt;b&gt; "q"<\/title>/.test(r.html)],
  ['href reachable only #frag', S(`<defs><path id="p" d="M0 0 L5 5"/></defs><use href="#p"/><use href="/p"/><use href="#"/><use href="http://e.test/#p"/>`), (r) => r.ok && (r.html.match(/href="#/g) || []).length === 1 && !/e\.test|href="\//.test(r.html)],
  ['inline-directive-like text', S(`<text x="1" y="5">:foo[bar]{x=1} font-family:serif xlink:href</text>`), (r) => r.ok && /:foo\[bar\]/.test(r.html)],
]
ok(hostile.length >= 25, 'hostile corpus >= 25')
for (const [name, src, assert] of hostile) {
  const r = checkProps(name, src)
  if (assert) ok(assert(r), `hostile "${name}" assertion\n  result: ${JSON.stringify(r).slice(0, 400)}`)
}
console.log(`hostile: ${hostile.length}`)

// ───────── scoping ─────────
{
  const a = sanitizeSvg(`<svg viewBox="0 0 9 9"><defs><marker id="arrow" refX="1"><path d="M0 0" fill="red"/></marker></defs><path d="M1 1 L5 5" marker-end="url(#arrow)" class="box"/><style>.box{fill:red} #arrow{x:y}</style></svg>`)
  const b = sanitizeSvg(`<svg viewBox="0 0 9 9"><defs><marker id="arrow" refX="1"><path d="M0 0" fill="blue"/></marker></defs><path d="M1 1 L5 5" marker-end="url(#arrow)" class="box"/><style>.box{fill:blue}</style></svg>`)
  ok(a.ok && b.ok && a.scope !== b.scope, 'different sources → different scope')
  ok(a.html.includes(`id="${a.scope}-arrow"`) && a.html.includes(`url(#${a.scope}-arrow)`) && a.html.includes(`class="${a.scope}-box"`), 'ids/refs/classes prefixed')
  ok(a.html.includes(`<style>.${a.scope} .${a.scope}-box{fill:red}`), 'style selector scoped')
  ok(!b.html.includes(a.scope), 'blocks do not share scope strings')
  const a2 = sanitizeSvg(`  <svg viewBox="0 0 9 9"><defs><marker id="arrow" refX="1"><path d="M0 0" fill="red"/></marker></defs><path d="M1 1 L5 5" marker-end="url(#arrow)" class="box"/><style>.box{fill:red} #arrow{x:y}</style></svg>  `)
  ok(a2.ok && a2.html === a.html, 'surrounding whitespace does not change output')
  const syn = sanitizeSvg('<svg width="120" height="60"><rect width="5" height="5"/></svg>')
  ok(syn.ok && /viewBox="0 0 120 60"/.test(syn.html), 'viewBox synthesized from width/height')
  const hv = sanitizeSvg('<svg viewBox="0 0 9 9"><rect fill="var(--c-primary)" stroke="currentColor" width="5" height="5"/></svg>')
  ok(hv.ok && /style="fill:var\(--c-primary\)"/.test(hv.html) && /stroke="currentColor"/.test(hv.html) && !/ fill=/.test(hv.html), 'var() presentation attr moved to style')
  const al = sanitizeSvg('<svg viewBox="0 0 9 9" aria-labelledby="t d x:y"><title id="t">T</title><desc id="d">D</desc><rect width="5" height="5"/></svg>')
  ok(al.ok && al.html.includes(`aria-labelledby="${al.scope}-t ${al.scope}-d"`), 'aria-labelledby tokens scoped')
  const cd = sanitizeSvg('<svg viewBox="0 0 9 9"><rect width="5" height="5"/></svg>')
  ok(cd.ok && !/xmlns|role|aria/.test(cd.html), 'no xmlns/role/aria added')
}

// ───────── realistic ─────────
const normTree = (s) => {
  const toks = []
  for (const m of s.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g)) {
    if (m[2]) {
      if (m[1]) continue
      let name = m[2].toLowerCase()
      if (name === 'a' || name === 'style') continue
      const attrs = [...m[3].matchAll(/\s([^\s=]+)\s*=\s*"([^"]*)"/g)].map((x) => x[1].toLowerCase().replace('xlink:href', 'href') + '=' + x[2]).filter((x) => !x.startsWith('xmlns')).sort()
      toks.push(name + '[' + attrs.join(',') + ']')
    } else if (m[5] && m[5].trim()) toks.push('#' + m[5].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
  }
  return toks.join('|')
}
{
  const dir = path.resolve('scripts/svg-fixtures/realistic')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))
  ok(files.length >= 5, 'realistic corpus >= 5')
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    const r = checkProps('realistic/' + f, src)
    ok(r.ok, `realistic ${f} renders`)
    if (r.ok && /<style>/.test(src)) ok(/<style>/.test(r.html), `realistic ${f} keeps <style>`)
    if (r.ok) {
      // <a> + dropped-xmlns are the only expected structural differences; both normalised away
      const hadVB = /viewBox=/i.test(src)
      const prep = (x, side) => {
        let t = x.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<style>[\s\S]*?<\/style>/g, '')
        if (side === 'in') t = t.replace(/\s(fill|stroke|stop-color|flood-color)="(var\([^"]*)"/g, ' style="$1:$2"')
        else {
          t = t.split(r.scope + '-').join('')
          if (!hadVB) t = t.replace(/\sviewBox="[^"]*"/, '')
        }
        return t
      }
      const a = normTree(prep(src, 'in'))
      const b = normTree(prep(r.html, 'out'))
      ok(a === b, `realistic ${f} structural equality\n  in:  ${a.slice(0, 300)}\n  out: ${b.slice(0, 300)}`)
    }
  }
  console.log(`realistic: ${files.length}`)
}

// ───────── fuzz ─────────
{
  let seed = 0x5eed1234
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const seeds = [
    ...hostile.map((h) => h[1]),
    ...fs.readdirSync('scripts/svg-fixtures/realistic').map((f) => fs.readFileSync('scripts/svg-fixtures/realistic/' + f, 'utf8')),
  ]
  const frags = ['<', '>', '"', "'", '</', '/>', '<!--', '-->', '<![CDATA[', ']]>', '&#x3c;', '&#60;', '&', '=', ' onload="x()"', '<script>x</script>',
    '<foreignObject>', 'javascript:', 'url(http://e.test)', 'url(#a)', '\\75rl(', '{', '}', ';', '<style>', '</style>', 'href="x"', 'xlink:href="#a"',
    '<svg>', '</svg>', '<a href="javascript:x()">', '</a>', '<title>', '</title>', '<!DOCTYPE x [', ']>', '\u0000', 'style="fill:var(--a)"', ' class="mermaid"']
  let okCount = 0
  let errCount = 0
  const N = 7000
  for (let n = 0; n < N; n++) {
    let s = pick(seeds)
    if (n % 2) {
      // gentle mode: one value-level mutation that keeps the markup well-formed, so most cases reach the re-scan
      const p = s.indexOf('<rect') >= 0 ? s.indexOf('<rect') + 5 : s.indexOf('<svg') + 4
      const ins = pick([' onload="x()"', ' href="http://e.test"', ' fill="url(http://e.test)"', ' class="mermaid code-line"', ' style="fill:url(http://e.test);position:fixed"',
        ' id="a b"', ' ONCLICK="x()"', ' xlink:href="javascript:x()"', ' data-x="1"', ' fill="var(--c-primary)"', ' style="transform:scale(9)"', ' x="&#60;script&#62;"'])
      s = s.slice(0, p) + ins + s.slice(p)
      if (rnd() < 0.5) { const q = Math.floor(rnd() * s.length); s = s.slice(0, q) + pick(['<script>x</script>', '<foreignObject/>', '<g onclick="x()"/>', '<rect x="1" y="1" width="2" height="2"/>', '<!-- c -->']) + s.slice(q) }
    }
    const ops = n % 2 ? 0 : 1 + Math.floor(rnd() * 5)
    for (let k = 0; k < ops; k++) {
      const p = Math.floor(rnd() * (s.length + 1))
      switch (Math.floor(rnd() * 6)) {
        case 0: s = s.slice(0, p) + pick(frags) + s.slice(p); break
        case 1: s = s.slice(0, p) + s.slice(p + Math.floor(rnd() * 20)); break
        case 2: s = s.slice(0, p); break
        case 3: { const e = p + Math.floor(rnd() * 40); s = s.slice(0, e) + s.slice(p, e) + s.slice(e); break }
        case 4: { const e = p + Math.floor(rnd() * 12); s = s.slice(0, p) + s.slice(p, e).toUpperCase() + s.slice(e); break }
        default: s = s.slice(0, p) + pick(frags) + pick(frags) + s.slice(p)
      }
    }
    let r
    try { r = sanitizeSvg(s) } catch (e) { fail(`fuzz #${n} threw: ${e}`); continue }
    if (r.ok) {
      okCount++
      rescan(r.html, `fuzz#${n}`)
      const r2 = sanitizeSvg(r.html)
      if (r2.ok) {
        rescan(r2.html, `fuzz#${n}/pass2`)
        checks++
        if (normScope(r.html, r.scope) !== normScope(normScope(r2.html, r2.scope), r.scope)) fail(`fuzz #${n} idempotence\n  src: ${JSON.stringify(s).slice(0, 300)}`)
      } else fail(`fuzz #${n} pass 2 errored ${JSON.stringify(r2.error)}\n  src: ${JSON.stringify(s).slice(0, 300)}`)
    } else errCount++
  }
  ok(okCount >= 1500, `fuzz produced enough ok results (${okCount})`)
  console.log(`fuzz: ${N} cases, ${okCount} ok, ${errCount} errors`)
}

// ───────── perf / limits ─────────
{
  const pathological = {
    lt: '<'.repeat(100_000),
    anchors: '<svg>' + '<a '.repeat(33_000),
    nestG: '<svg>' + '<g>'.repeat(33_000),
    amps: '<svg><text>' + '&#x'.repeat(33_000) + '</text></svg>',
    quotes: '<svg><rect a="' + '"'.repeat(100_000),
    braces: '<svg><style>' + '{'.repeat(100_000) + '</style><rect/></svg>',
    selectors: '<svg><style>' + '.a'.repeat(50_000) + '{fill:red}</style><rect/></svg>',
    decls: '<svg><style>.a{' + 'fill:red;'.repeat(11_000) + '}</style><rect/></svg>',
    comments: '<svg>' + '<!--'.repeat(25_000),
    styleSpam: '<svg>' + '<style></style>'.repeat(16_000) + '</svg>',
    scriptSpam: '<svg>' + '<script></script>'.repeat(14_000) + '</svg>',
    bangSpam: '<svg>' + '<!x>'.repeat(25_000) + '</svg>',
    bangBracket: '<svg>' + '<!x [ ]>'.repeat(12_000) + '</svg>',
    varSpam: '<svg><rect style="fill:' + 'var(--a)'.repeat(8_000) + '"/></svg>',
    varSpamBig: '<svg><rect style="fill:' + 'var(--a)'.repeat(30_000) + '"/></svg>',
    styleBig: '<svg><style>' + '.a{fill:red}'.repeat(20_000) + '</style><rect/></svg>',
    attrsBig: '<svg>' + '<rect x="1" y="2" width="3" height="4" fill="red"/>'.repeat(4_800) + '</svg>',
    varNestClosed: '<svg>' + ('<rect style="fill:' + 'var(--a,'.repeat(7_000) + 'red' + ')'.repeat(7_000) + '"/>').repeat(3) + '</svg>',
    selExpand: '<svg><style>' + '.a,'.repeat(80_000) + '.b{fill:red}</style><rect/></svg>',
    imageBig: '<svg><image href="data:image/png;base64,' + 'A'.repeat(200_000) + '" width="4" height="4"/><rect/></svg>',
    varnest: '<svg><rect style="fill:' + 'var('.repeat(30_000) + '"/></svg>',
    spaces: '<svg' + ' '.repeat(100_000),
    siblings: '<svg>' + '<rect/>'.repeat(14_000) + '</svg>',
    text: '<svg><text>' + 'x &amp; '.repeat(12_000) + '</text></svg>',
  }
  for (const [name, src] of Object.entries(pathological)) {
    const t0 = performance.now()
    const r = sanitizeSvg(src)
    const ms = performance.now() - t0
    ok(ms < 1000, `perf ${name}: ${ms.toFixed(0)}ms (>=1s)`)
    if (r.ok) rescan(r.html, 'perf ' + name)
  }
  const big = sanitizeSvg('<svg>' + '<rect/>'.repeat(60_000) + '</svg>')
  ok(!big.ok && big.error.kind === 'too-large' && big.error.kb === Math.ceil(('<svg>' + '<rect/>'.repeat(60_000) + '</svg>').length / 1024), '300KB → too-large (kb)')
  ok(SVG_MAX_BYTES === 256 * 1024, 'SVG_MAX_BYTES')
  const sc = sanitizeSvg('x'.repeat(300 * 1024))
  ok(!sc.ok && sc.error.kind === 'too-large', '300KB plain → too-large')
  console.log('perf: ok')
}

if (failures) {
  console.error(`\n${failures} failure(s) in ${checks} checks`)
  process.exit(1)
}
console.log(`\ncheck-svg: all ${checks} checks passed`)
