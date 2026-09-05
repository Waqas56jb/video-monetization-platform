# Launch-day cleanup — exact steps

Run these in order, from `server/`, against production (`server/.env` already points there).
Every step here is idempotent — running it twice does nothing extra the second time — except
where noted.

## 1. Reverse remaining e2e test accounts

Keeps the one documented fixture (`e2e+8238822854@mtonyo.test`, see `E2E-ACCOUNTS.md`) because it
is still the account the player/entitlement/cross-browser suites sign in as. Everything else
matching `e2e+%@mtonyo.test` is refunded through the real admin refund path (so a creator's share
is taken back with the sale) and then deleted.

```
node scripts/cleanup-e2e.mjs --exclude e2e+8238822854@mtonyo.test                     # dry run first
ADMIN_TOKEN=<a live admin access token> \
  node scripts/cleanup-e2e.mjs --exclude e2e+8238822854@mtonyo.test --apply
```

Run again with no `--exclude` once the fixture account is no longer needed (i.e. once the suites
that depend on it are retired), to remove it too.

**Known limitation, not introduced by this step:** account deletion sometimes reports
`auth delete failed: Database error deleting user` and falls back to removing the `profiles` row
directly. The public-facing data (purchases, payments, earnings, the profile itself) is correctly
gone either way; what can be left behind is an orphaned `auth.users` row with no profile, which
means that exact email address may refuse to sign up again with "already registered." This is
pre-existing behaviour of `cleanup-e2e.mjs`, not something this cleanup pass changed — if it
matters before launch, it needs a Supabase-side look at what is still referencing those
`auth.users` rows.

## 2. Confirm demo content is flagged, not deleted

The demo catalogue (Asha/Juma/Neema and their videos) stays published — it is the site's own
test content and the client wants a populated "Creators Are Getting Paid" section before real
creators have meaningful earnings. Migration `034_is_demo_flag.sql` already flags every
`%@mtonyo.demo` profile with `is_demo = true`; nothing to run here unless a new demo/seed account
is created later, in which case flag it directly:

```
node -e "
import('dotenv/config').then(async () => {
  const { query } = await import('./src/db/pool.js')
  await query(\"update profiles set is_demo = true where email = \$1\", ['the-new-demo@mtonyo.demo'])
  process.exit(0)
})"
```

## 3. Turn off demo content in public stats

`platform_settings.show_demo_content_in_stats` defaults **ON** so the "Creators Are Getting Paid"
section (and anything else that reads the same flag) is never empty before real creators have
earnings. Once real, non-demo creators have enough earnings to populate it on their own, an
administrator flips this off from **Admin → Settings → Platform settings → "Show demo accounts in
public stats."** No script needed; this is a one-click toggle, deliberately left as a judgement
call for whoever is running launch day rather than automated here.

## 4. Collapse duplicate creator applications

As of this cleanup pass (2026-09-06) there are **zero** users with more than one
`creator_applications` row — migration `020_creator_applications.sql`'s own partial unique index
already prevents a second *pending* application, so a duplicate can only appear if two applications
exist in different terminal states. Check again on launch day in case that has changed:

```
node -e "
import('dotenv/config').then(async () => {
  const { many } = await import('./src/db/pool.js')
  const dupes = await many('select user_id, count(*)::int as n from creator_applications group by user_id having count(*) > 1')
  console.log('users with >1 application:', dupes.length)
  console.log(dupes)
  process.exit(0)
})"
```

If any user shows up: keep the newest application and withdraw the older one(s) through the
existing admin action (**Admin → Creator Applications → open the older row → Decline**, or
`POST /api/admin/creator-applications/:id/decide` with `{"decision":"decline"}` using a live admin
token) — the same route a human uses today, not a raw `DELETE`, so it is audited and the applicant
is notified rather than the row silently vanishing.

## 5. Test videos already off the public site — re-confirm

Both `whatsapp-video-2026-08-15-at-11-50-34-pm` and `80915499123-fd8feac4-6609-4d3e-8739-d3a2cdde7f76`
were unpublished during an earlier pass (M2-VERIFY.md, C7) and should stay that way. Confirm on
launch day:

```
node -e "
import('dotenv/config').then(async () => {
  const { many } = await import('./src/db/pool.js')
  const rows = await many(\`select slug, is_published from videos
    where slug in ('whatsapp-video-2026-08-15-at-11-50-34-pm','80915499123-fd8feac4-6609-4d3e-8739-d3a2cdde7f76')\`)
  console.log(rows)
  process.exit(0)
})"
```

Both `is_published` should read `false`. If either is `true`, unpublish it again through
**Admin → Videos**, not a direct database write, so the action is audited and the buyer-keeps-access
guarantee is exercised through the real code path.

## 6. Not automated on purpose

- `rpreplay-final1589783013-2` (a real creator's raw iOS screen-recording filename, no description)
  is a content-quality nudge, not test data — ask the creator to rename/describe it, don't touch it
  from a script.
- Deleting the e2e fixture account itself (step 1's `--exclude` account) is a judgement call for
  whoever is about to hand the site over, not something to automate — it is still in active use by
  the test suites as of this writing.
