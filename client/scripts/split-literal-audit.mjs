/**
 * No hard-coded revenue split anywhere in client or admin source.
 *
 * The client set the split to 70/30 and it drifted to 60/40 in production for
 * about a week without a single application surface disagreeing — because
 * every real surface reads `platform_settings.creator_split_percent` live.
 * The one place that DIDN'T was a literal string in marketing copy
 * (`client/src/data/copy.js`, "Generous 70/30 revenue split") that happened
 * to agree with the setting until an admin actually changed it. This audit
 * exists so that class of bug cannot come back silently: it fails the build
 * if two numbers that sum to 100, written as "NN/NN", appear anywhere near a
 * split/revenue/share/earn word in either app's source.
 *
 * Deliberately narrow. A two-number literal split is a specific, recognisable
 * shape — an aspect ratio or a date does not sum to 100 next to "revenue", and
 * a dynamic value built from a variable (`${creatorShare}/${100 - creatorShare}`)
 * never matches `\d{1,3}\s*\/\s*\d{1,3}` in the first place, so nothing here
 * needs an allow-list of "trusted" files. Comment lines are skipped so this
 * script can describe the bug it is guarding against without tripping over
 * its own words.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOTS = [
  fileURLToPath(new URL('../src', import.meta.url)),
  fileURLToPath(new URL('../../admin/src', import.meta.url)),
]

const SPLIT_PAIR = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g
const CONTEXT_WORD = /split|revenue|share|earn/i
const CODE_FILE = /\.(jsx?|tsx?)$/
const SKIP_FILE = /\.test\.[jt]sx?$/

function isCommentLine(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      walk(full, out)
    } else if (CODE_FILE.test(name) && !SKIP_FILE.test(name)) {
      out.push(full)
    }
  }
  return out
}

const offenders = []

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return
      let m
      SPLIT_PAIR.lastIndex = 0
      while ((m = SPLIT_PAIR.exec(line))) {
        const a = Number(m[1])
        const b = Number(m[2])
        if (a + b !== 100) continue
        // Look at this line plus one before/after for a split-ish word — the
        // literal and the word that makes it dangerous are usually adjacent
        // but occasionally split across a template string and its label.
        const context = [lines[i - 1], line, lines[i + 1]].filter(Boolean).join(' ')
        if (!CONTEXT_WORD.test(context)) continue
        offenders.push({ file, line: i + 1, text: line.trim().slice(0, 100) })
      }
    })
  }
}

console.log(`split-literal audit: ${offenders.length} offender(s)`)
for (const o of offenders) {
  console.log(`  ${o.file.replace(/\\/g, '/')}:${o.line}`)
  console.log(`    ${o.text}`)
}
if (offenders.length) {
  console.log('\nA literal "NN/NN" split next to a revenue/share word will not follow the setting')
  console.log('when an admin changes it. Read it from platform_settings instead.')
  process.exit(1)
}
console.log('no hard-coded split found')
process.exit(0)
