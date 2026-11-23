import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { socialIcon, socialLabel } from '../lib/socialLinks.js'

const dir = dirname(fileURLToPath(import.meta.url))

test('public creator page is a storefront, not a name and a grid', () => {
  const src = readFileSync(join(dir, 'CreatorProfile.jsx'), 'utf8')
  for (const needle of [
    'Featured release',
    'Latest releases',
    'Most watched',
    'Full catalogue',
    'creator-socials',
    'creator-follow',
    'totalViews',
    'Follow',
  ]) {
    assert.match(src, new RegExp(needle), `missing ${needle}`)
  }
  assert.doesNotMatch(src, /All published videos/)
})

test('social links pick an icon from the host', () => {
  assert.equal(socialIcon('https://instagram.com/x'), 'instagram')
  assert.equal(socialIcon('https://youtube.com/watch?v=1'), 'youtube')
  assert.equal(socialLabel('https://www.tiktok.com/@x'), 'tiktok.com')
})

/**
 * Client, 2026-11-22: a creator with 1–4 videos showed the same cards under
 * Featured, Latest, Most watched and Full catalogue, each row mostly black.
 */
test('a small catalogue shows each video once, then other creators, and grids never end in black space', () => {
  const src = readFileSync(join(dir, 'CreatorProfile.jsx'), 'utf8')
  assert.match(src, /const small = videos\.length <= 4/)
  assert.match(src, /!small && c\.latest/)
  assert.match(src, /!small && c\.mostWatched/)
  assert.match(src, /Discover more on MTONYO\+/)
  const grid = readFileSync(join(dir, '../components/ui/VideoGrid.jsx'), 'utf8')
  assert.match(grid, /'data-r4': n % 4, 'data-r3': n % 3, 'data-r2': n % 2/)
  const css = readFileSync(join(dir, '../styles/global.css'), 'utf8')
  for (const r of ['data-r4="1"] .explore-tile{display:flex;grid-column:span 3}', 'data-r4="3"] .explore-tile{display:flex;grid-column:span 1}', 'data-r3="1"] .explore-tile{display:flex;grid-column:span 2}', 'data-r2="1"] .explore-tile'])
    assert.ok(css.includes(r), `missing ${r}`)
})

test('the watch page ends in several discovery sections, not one short row', () => {
  const src = readFileSync(join(dir, '../components/watch/WatchDiscover.jsx'), 'utf8')
  for (const t of ['More from', 'You may also like', 'Trending now', 'Most watched', 'Discover more creators', 'Browse all videos'])
    assert.ok(src.includes(t), `missing ${t}`)
  assert.match(src, /shown\.has\(v\.id\)/, 'a video must not repeat across sections')
  const watch = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(watch, /<WatchDiscover video=\{v\} \/>/)
})

test('client artwork: discover tile, explore banner, profile background, watch rail', () => {
  const brand = readFileSync(join(dir, '../components/ui/Brand.jsx'), 'utf8')
  for (const f of ['discover', 'discover-narrow', 'explore', 'explore-narrow', 'profile-bg', 'montage'])
    assert.ok(brand.includes(`'${f}'`), `missing ${f}`)
  const css = readFileSync(join(dir, '../styles/global.css'), 'utf8')
  assert.match(css, /\.explore-tile \.et-art\{position:absolute;inset:0;width:100%;height:100%;object-fit:contain\}/, 'the artwork must never be cropped or stretched')
  assert.match(css, /url\(\/brand\/profile-bg-2172\.webp\)/)
  assert.match(css, /\.watch-layout\{grid-template-columns:minmax\(0,72fr\) minmax\(270px,28fr\)/)
  const explore = readFileSync(join(dir, 'Explore.jsx'), 'utf8')
  assert.match(explore, /<ExploreBanner/)
  const watch = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(watch, /<WatchRail video=\{v\} \/>/)
})
