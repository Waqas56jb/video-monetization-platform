-- ============================================================================
-- 039 · crawler_hits records the whole request, not only who claimed to send it
-- ============================================================================
--
-- Four rounds of "sharing a link from a desktop shows a bare URL" were
-- diagnosed against a crawler_hits that, by construction, could not hold the
-- request in question: rows were written only for User-Agents naming a known
-- crawler, and a desktop WhatsApp client fetching a preview from the user's
-- own machine sends an ordinary browser User-Agent. So "no row" was read as
-- "WhatsApp never asked" when it could equally mean "it asked, and we chose
-- not to remember".
--
-- These columns make one row a complete account of one request: how it
-- arrived (method, every Sec-Fetch-* / Accept / Origin / Referer / client-hint
-- header, as JSON), where from (client IP, and the country and city Vercel
-- resolved it to — a fetch from Dar es Salaam is the user's app, a fetch from
-- Menlo Park is Meta's crawler), what we answered (doc) and by which rule
-- (decision), and which deploy answered (build). Writes are unchanged in
-- shape: fire-and-forget from the API's own connection, RLS untouched.
-- ============================================================================

alter table crawler_hits
  add column if not exists method   text,
  add column if not exists doc      text,
  add column if not exists ip       text,
  add column if not exists country  text,
  add column if not exists city     text,
  add column if not exists headers  jsonb,
  add column if not exists build    text,
  add column if not exists decision text;

comment on column crawler_hits.doc is
  'What was served: crawler | shell | fallback | preflight for the document; '
  'cdn | api | 404 | 502 | bad-slug for the poster.';
comment on column crawler_hits.decision is
  'The rule that chose the document (bot-ua | real-navigation | '
  'sec-fetch-navigate | sec-fetch-fetch | no-signal), plus the share-meta '
  'source (memo | api | miss) — from client/api/_lib/ogDocument.js unfurlReason.';
comment on column crawler_hits.headers is
  'The request headers that could decide or explain the answer, captured '
  'verbatim (values capped at 300 chars, whole object at 6000).';
