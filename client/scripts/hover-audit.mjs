/**
 * Every hover rule that MOVES something must be behind both touch guards.
 *
 * On a touch screen a hover rule fires on the first tap: the tap applies the
 * hover state instead of activating the thing, the element shifts, and the
 * viewer taps again. That is the "first tap does nothing" the client reported on
 * iPad, and it is caused by one unguarded rule at a time — so this checks all of
 * them rather than the one that was noticed.
 *
 * Two guards, because neither is sufficient alone. `hover: hover` is reported by
 * an iPad with a Magic Keyboard, so `pointer: fine` is what actually separates a
 * mouse from a finger; `html:not(.is-touch)` is this codebase's runtime guard for
 * the cases media queries get wrong.
 *
 * Rules inside a touch block — `@media (hover: none), (pointer: coarse)` — are
 * ignored, and so is `transform: none`. Those exist to REMOVE motion on touch;
 * they are the fix, not the fault. The first version of this flagged two of
 * them, because `translate(-50%,-50%)` is a reset back to an element's own
 * centring and does not look like one.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FILE = fileURLToPath(new URL('../src/styles/global.css', import.meta.url))
const css = readFileSync(FILE, 'utf8')
const lines = css.split('\n')

const MOVES = /(transform|top|left|right|bottom|margin|width|height)\s*:/
const RESET = /transform\s*:\s*none|:\s*0(px)?\s*[;}]/

/** Track the @media blocks a line sits inside, by brace depth. */
const stack = []
let depth = 0
const offenders = []
const guarded = []

lines.forEach((line, i) => {
  const opens = (line.match(/\{/g) || []).length
  const closes = (line.match(/\}/g) || []).length
  const media = line.match(/@media([^{]*)\{/)

  if (/:hover/.test(line) && MOVES.test(line) && !RESET.test(line)) {
    const inMedia = stack.map((m) => m.q).join(' ')
    /* A touch block's hover rules are cancellations; leave them alone. */
    if (/hover\s*:\s*none|pointer\s*:\s*coarse/.test(inMedia)) return
    const hasHover = /hover\s*:\s*hover/.test(inMedia)
    const hasFine = /pointer\s*:\s*fine/.test(inMedia)
    const hasClass = /html:not\(\.is-touch\)/.test(line)
    const entry = { line: i + 1, text: line.trim().slice(0, 88), hasHover, hasFine, hasClass }
    if (hasHover && hasFine && hasClass) guarded.push(entry)
    else offenders.push(entry)
  }

  if (media) stack.push({ q: media[1], depth })
  depth += opens - closes
  while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop()
})

console.log(`hover rules that move something: ${guarded.length + offenders.length} (${guarded.length} guarded)`)
for (const o of offenders) {
  console.log(`  UNGUARDED global.css:${o.line}  hover:hover=${o.hasHover} pointer:fine=${o.hasFine} html:not(.is-touch)=${o.hasClass}`)
  console.log(`    ${o.text}`)
}
if (offenders.length) {
  console.log('\nEach of these costs the first tap on a touch screen.')
  process.exit(1)
}
console.log('all guarded')
process.exit(0)
