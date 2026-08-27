import { one, many, closePool } from '../src/db/pool.js'

const me = await one('select current_user as u, session_user as s, current_database() as db')
console.log('session', me)

const owners = await many(`
  select c.relname, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 1
`)
console.log('owners', [...new Set(owners.map((o) => o.owner))])

const def = await many(`
  select defaclrole::regrole::text as role,
         defaclnamespace::regnamespace::text as nsp,
         defaclobjtype,
         defaclacl::text as acl
    from pg_default_acl
`)
console.log('default_acl', def)

const views = await many(`
  select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v','m')
`)
console.log('views', views)

await closePool()
