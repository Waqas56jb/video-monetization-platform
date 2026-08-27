import { many, closePool } from '../src/db/pool.js'

const fn = await many(`
  select p.proname,
         pg_catalog.pg_get_userbyid(p.proowner) as owner,
         p.prosecdef as definer,
         p.proacl::text as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
   order by 1
`)
for (const f of fn) {
  const leak = /anon|authenticated/i.test(f.acl || '') ? ' GRANT-LEAK' : ''
  console.log(`${f.proname} definer=${f.definer} owner=${f.owner}${leak} acl=${f.acl || '(default)'}`)
}
await closePool()
