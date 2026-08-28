import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

test('start and stop stay stable so RouteProgress cannot loop the bar', () => {
  const src = readFileSync(join(dir, 'ProgressContext.jsx'), 'utf8')
  assert.match(src, /useCallback\(\(\) => \{[\s\S]*setActive\(true\)[\s\S]*\}, \[\]\)/)
  assert.match(src, /useCallback\(\(\) => \{[\s\S]*setActive\(false\)[\s\S]*\}, \[\]\)/)
  assert.match(src, /8000/)
  assert.doesNotMatch(src, /start:\s*\(\)\s*=>\s*setActive\(true\)/)
})

test('RouteProgress depends only on the URL, not start/stop identity', () => {
  const src = readFileSync(join(dir, '../App.jsx'), 'utf8')
  const block = src.match(/function RouteProgress\(\) \{[\s\S]*?\n\}/)
  assert.ok(block, 'RouteProgress is missing')
  assert.match(block[0], /\[location\.pathname, location\.search\]/)
  assert.doesNotMatch(block[0], /\[location\.pathname, location\.search, start, stop\]/)
})

test('the progress context is render-stable, so a card tap cannot re-render the grid', () => {
  const src = readFileSync(join(dir, 'ProgressContext.jsx'), 'utf8')

  // `active` in the value made a new object on every toggle, and the consumers
  // include every VideoCard on screen — so starting the bar on a card tap
  // re-rendered the whole grid before navigation had begun.
  assert.match(src, /useMemo\(\(\) => \(\{ setActive, start, stop \}\), \[start, stop\]\)/)
  assert.doesNotMatch(src, /\[active, start, stop\]/)

  // Nothing may read `active` through the context — the bar takes it as a prop.
  assert.match(src, /<TopProgress active=\{active\} \/>/)

  // The default handed to a consumer outside the provider must match the shape
  // the provider actually supplies.
  const fallback = src.match(/createContext\(\{[\s\S]*?\}\)/)
  assert.ok(fallback)
  assert.doesNotMatch(fallback[0], /active:/)
})

test('no consumer destructures active from the progress context', () => {
  const files = ['../App.jsx', '../components/ui/VideoCard.jsx', '../pages/Watch.jsx']
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    for (const m of src.matchAll(/const \{([^}]*)\} = useProgress\(\)/g)) {
      assert.doesNotMatch(m[1], /\bactive\b/, `${f} reads active from context`)
    }
  }
})
