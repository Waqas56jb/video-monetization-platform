/**
 * The category taxonomy, and the one place that decides what counts as a
 * category.
 *
 * The client reported seeing both "Documentaries" and "Documentary" in the
 * filters. The dropdowns were never the problem — every one of them is built
 * from a single list in the front end. The problem was that nothing stopped
 * other values reaching the database: the API validated `category` as any
 * string up to 60 characters, so whatever was written stayed written, and
 * Explore appends any unrecognised value it finds so that content categorised
 * before the fixed list existed does not silently vanish. Two spellings in the
 * table became two chips on the screen.
 *
 * Constraining it here closes the door the values came through. Anything not on
 * the list is mapped if we recognise it and rejected if we do not, so the
 * database cannot drift again.
 */

export const CATEGORIES = [
  'Films',
  'Series',
  'Music',
  'Concerts',
  'Comedy',
  'Documentaries',
  'Sports',
  'Podcasts',
  'Courses',
  'Behind the Scenes',
  'Food',
]

/**
 * Spellings we have actually seen, plus the obvious singular/plural slips.
 *
 * Keyed on a squashed form of the word — lowercase, no spaces or punctuation —
 * so "Behind the Scenes", "behind-the-scenes" and "BehindTheScenes" all land in
 * the same place without needing an entry each.
 */
const squash = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '')

const ALIASES = {
  film: 'Films',
  movie: 'Films',
  movies: 'Films',
  serie: 'Series',
  show: 'Series',
  shows: 'Series',
  concert: 'Concerts',
  documentary: 'Documentaries',
  documentries: 'Documentaries',
  docu: 'Documentaries',
  sport: 'Sports',
  podcast: 'Podcasts',
  course: 'Courses',
  tutorial: 'Courses',
  tutorials: 'Courses',
  bts: 'Behind the Scenes',
  cooking: 'Food',
  recipe: 'Food',
  recipes: 'Food',
}

const BY_SQUASHED = new Map(CATEGORIES.map((c) => [squash(c), c]))

/**
 * The canonical spelling of a category, or null when there isn't one.
 *
 * Empty input returns null rather than throwing — a video is allowed to have no
 * category, and "none" and "unrecognised" are different answers.
 */
export function normalizeCategory(value) {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null
  const key = squash(raw)
  return BY_SQUASHED.get(key) || ALIASES[key] || null
}

/** Is this a category we will store? Used by request validation. */
export function isKnownCategory(value) {
  if (value == null || String(value).trim() === '') return true
  return normalizeCategory(value) != null
}
