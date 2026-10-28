-- 046 · Where a paying viewer came from (Milestone 3: social → payment).
--
-- Captured in the browser on the visit that brought the viewer in (WhatsApp,
-- Facebook, Instagram, TikTok, a campaign link…) and sent with the payment, so
-- the admin can see which channel actually sells. Nothing here decides access.
--
-- traffic_source    normalised channel: whatsapp, facebook, instagram, tiktok,
--                   twitter, youtube, telegram, search, other, direct
-- traffic_campaign  utm_campaign (or similar) from the link, if any
-- traffic_referrer  the referring HOST only (never a full URL)

alter table payments add column if not exists traffic_source   text;
alter table payments add column if not exists traffic_campaign text;
alter table payments add column if not exists traffic_referrer text;

create index if not exists payments_traffic_source_idx on payments (traffic_source, created_at desc);
