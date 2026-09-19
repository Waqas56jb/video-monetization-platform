-- Every request the rate limiter refuses, with the facts needed to say WHY.
--
-- 2026-09-19: the client kept seeing "Too many requests" after two fixes that
-- were each proven from this side (per-address keying, then per-user keying).
-- Their traffic could only be reasoned about, not read — Railway's request log
-- is not reachable from here. This table is that log, for the one thing that
-- matters: which bucket a refused request was billed to, what raw forwarding
-- chain it arrived with, and what it was asking for.
--
-- Written fire-and-forget from the limiter's handler, at most once a second per
-- bucket, so a flood costs a handful of rows, not a write storm.

create table if not exists rate_limit_hits (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  bucket        text        not null,   -- 'user:<id>' or 'ip:<address>' as the limiter keyed it
  ip            inet,                   -- req.ip as Express resolved it
  forwarded_for text,                   -- the raw X-Forwarded-For chain
  hops          smallint,               -- entries in that chain
  method        text        not null,
  path          text        not null,
  user_id       uuid,                   -- when the bucket was a verified user
  user_agent    text,
  retry_after_s smallint
);

create index if not exists rate_limit_hits_at_idx on rate_limit_hits (at desc);

alter table rate_limit_hits enable row level security;
revoke all on table rate_limit_hits from anon, authenticated, public;
