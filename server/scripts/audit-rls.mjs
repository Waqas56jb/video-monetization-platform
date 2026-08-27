/**
 * Live RLS / grant / policy audit of public schema.
 * Prints table names and flags only — never keys or row contents.
 */
import { many, closePool } from '../src/db/pool.js'

const tables = await many(`
  select c.relname as table,
         c.relrowsecurity as rls,
         c.relforcerowsecurity as force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
   order by c.relname
`)

const policies = await many(`
  select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
    from pg_policies
   where schemaname = 'public'
   order by tablename, policyname
`)

const grants = await many(`
  select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'public')
   group by table_name, grantee
   order by table_name, grantee
`)

const applied = await many(`select name, applied_at from _migrations order by name`)

console.log('=== TABLES ===')
for (const t of tables) {
  const pols = policies.filter((p) => p.tablename === t.table)
  const g = grants.filter((x) => x.table_name === t.table)
  const flag = t.rls ? (pols.length ? 'RLS+POL' : 'RLS-CLOSED') : '*** RLS OFF ***'
  console.log(
    `${flag.padEnd(16)} force=${t.force_rls}  ${t.table}  policies=${pols.length}  grants=${g.map((x) => x.grantee + ':' + x.privs).join(' | ') || '(none to anon/auth)'}`
  )
}

console.log('\n=== POLICIES ===')
for (const p of policies) {
  console.log(`${p.tablename}.${p.policyname} [${p.cmd}] roles=${p.roles}`)
}

console.log('\n=== MIGRATIONS ===')
for (const m of applied) console.log(m.name)

await closePool()
