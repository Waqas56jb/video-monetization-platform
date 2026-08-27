/**
 * What is actually public vs awaiting review.
 *
 *   node scripts/audit-explore-public.mjs
 *   node scripts/audit-explore-public.mjs --fix-nyerere
 */
import { many, one, transaction, closePool } from '../src/db/pool.js'

const nyerere = await many(
  `select id, slug, title, category, review_status, is_published, published_at, deleted_at
     from videos
    where title ilike '%nyerere%'
    order by created_at`
)

console.log('NYERERE', JSON.stringify(nyerere, null, 2))

if (process.argv.includes('--fix-nyerere')) {
  const row = nyerere[0]
  if (!row) {
    console.error('no Nyerere row')
    await closePool()
    process.exit(1)
  }
  if (row.review_status === 'pending_review' && row.is_published === false) {
    console.log('already awaiting review and unpublished')
  } else {
    const admin = await one(`select id from profiles where role = 'admin' order by created_at limit 1`)
    await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos
              set is_published = false,
                  published_at = null,
                  review_status = 'pending_review',
                  state = 'ready'
            where id = $1
            returning id, title, review_status, is_published`,
          [row.id]
        )
        console.log('updated', rows[0])
      },
      { actorRole: 'admin', actorId: admin?.id || null }
    )
  }
}

const leak = await one(
  `select count(*)::int as n from videos
    where deleted_at is null
      and is_published = true
      and review_status <> 'approved'`
)
const stillPublic = await one(
  `select count(*)::int as n from videos
    where deleted_at is null
      and is_published = true
      and review_status = 'approved'
      and title ilike '%nyerere%'`
)
const publicRows = await many(
  `select title, category, review_status, is_published
     from videos
    where is_published = true and review_status = 'approved' and deleted_at is null
    order by published_at desc nulls last`
)
console.log('PUBLIC', publicRows.length)
for (const r of publicRows) {
  console.log(`  ${r.title}  [${r.category}]`)
}
console.log('published-but-not-approved', leak.n)
console.log('nyerere-still-in-public-catalogue', stillPublic.n)

await closePool()
process.exit(stillPublic.n === 0 && leak.n === 0 ? 0 : 1)
