import { many, closePool } from '../src/db/pool.js'

const cols = await many(`
  select column_name
    from information_schema.columns
   where table_name = 'pg_stat_statements'
   order by ordinal_position
`)
console.log('pg_stat_statements cols:', cols.map((c) => c.column_name).join(','))

const pgrst = await many(`
  select calls::bigint as calls,
         rows::bigint as rows_returned,
         round(mean_exec_time::numeric, 2) as mean_ms,
         left(query, 200) as q
    from pg_stat_statements
   where query ilike '%pgrst_source%'
      or query ilike '%rest/v1%'
   order by calls desc
   limit 40
`)
console.log('=== PostgREST-shaped statements ===')
for (const s of pgrst) {
  console.log(`calls=${s.calls} rows=${s.rows_returned} mean_ms=${s.mean_ms}`)
  console.log(' ', s.q.replace(/\s+/g, ' ').slice(0, 180))
}

await closePool()
