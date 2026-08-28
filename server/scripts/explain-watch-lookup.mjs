import 'dotenv/config'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

async function explain(client, label, sql, params) {
  console.log(`\n=== ${label} ===`)
  const r = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, params)
  console.log(r.rows.map((x) => x['QUERY PLAN']).join('\n'))
}

const client = await pool.connect()
try {
  const videos = await client.query(`
    select id::text as id, slug, access_type
      from videos
     where deleted_at is null and is_published = true
     order by published_at desc nulls last
     limit 8`)
  console.log('--- sample videos ---')
  for (const r of videos.rows) console.log(JSON.stringify(r))

  const idx = await client.query(`
    select tablename, indexname, indexdef
      from pg_indexes
     where schemaname = 'public'
       and tablename in ('videos', 'purchases', 'watch_progress')
     order by tablename, indexname`)
  console.log('\n--- indexes ---')
  for (const r of idx.rows) console.log(`${r.tablename}.${r.indexname} :: ${r.indexdef}`)

  const sample = videos.rows[0]
  if (!sample) throw new Error('no published videos')
  const { slug, id } = sample

  await explain(
    client,
    'OLD videoByKey by slug (id::text OR slug)',
    'select * from videos where (id::text = $1 or slug = any($2::text[])) and deleted_at is null',
    [slug, [slug]]
  )

  await explain(
    client,
    'OLD videoByKey by id (id::text OR slug)',
    'select * from videos where (id::text = $1 or slug = any($2::text[])) and deleted_at is null',
    [id, [id]]
  )

  await explain(
    client,
    'NEW videoByKey by slug (typed uuid null OR slug)',
    'select * from videos where deleted_at is null and (($1::uuid is not null and id = $1::uuid) or slug = any($2::text[]))',
    [null, [slug]]
  )

  await explain(
    client,
    'NEW videoByKey by id (typed uuid)',
    'select * from videos where deleted_at is null and (($1::uuid is not null and id = $1::uuid) or slug = any($2::text[]))',
    [id, [id]]
  )

  await explain(
    client,
    'COMBINED video+purchase+resume by slug (anon)',
    `select v.*, p.id as _purchase_id, p.purchased_at as _purchased_at, wp.seconds as _resume_seconds
       from videos v
       left join purchases p
         on $3::uuid is not null
        and p.video_id = v.id
        and p.user_id = $3::uuid
        and p.status = 'active'
       left join watch_progress wp
         on $3::uuid is not null
        and wp.video_id = v.id
        and wp.user_id = $3::uuid
      where v.deleted_at is null
        and (($1::uuid is not null and v.id = $1::uuid) or v.slug = any($2::text[]))
      limit 1`,
    [null, [slug], null]
  )
} finally {
  client.release()
  await pool.end()
}
