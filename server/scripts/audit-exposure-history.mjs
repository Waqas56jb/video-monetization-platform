import { one, many, closePool } from '../src/db/pool.js'

const applied = await many(
  `select name, applied_at from _migrations
    where name like '%share_card%' or name like '%011%' or name like '%021%'
    order by name`
)
console.log('=== relevant migrations ===')
for (const r of applied) console.log(r.applied_at?.toISOString?.() || r.applied_at, r.name)

const card = await one(
  `select count(*)::int as n,
          min(built_at) as oldest,
          max(built_at) as newest
     from share_card_cache`
)
console.log('=== share_card_cache rows (count only) ===')
console.log(card)

const rlsOff = await many(`
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
   order by 1
`)
console.log('=== RLS off ===', rlsOff.map((r) => r.relname))

const ext = await many(
  `select nspname from pg_namespace where nspname in ('lint', 'extensions') order by 1`
)
console.log('=== namespaces ===', ext)

try {
  const stmts = await many(`
    select calls::bigint as calls, left(query, 80) as q
      from pg_stat_statements
     where query ilike '%share_card_cache%'
     order by calls desc
     limit 10
  `)
  console.log('=== pg_stat_statements (truncated query text) ===')
  for (const s of stmts) console.log(s.calls, s.q)
} catch (err) {
  console.log('=== pg_stat_statements ===', err.message.split('\n')[0])
}

await closePool()
