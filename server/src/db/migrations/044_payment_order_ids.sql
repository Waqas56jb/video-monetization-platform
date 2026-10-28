-- Milestone 3: every payment traceable from both ends, and money taken twice
-- never lost track of.
--
-- merchant_order_id  OUR order id — what the gateway is given and echoes back.
--                    `provider_ref` keeps the gateway's own transaction id, so a
--                    payment can be looked up from either side's records.
-- refund_due         The viewer was charged but no new access was granted (they
--                    already owned the video, e.g. two prompts both approved).
--                    The money is real, so the row says so until an admin
--                    refunds it.

alter table payments add column if not exists merchant_order_id text;

update payments
   set merchant_order_id = 'MTN' || to_char(created_at at time zone 'Africa/Dar_es_Salaam', 'YYYYMMDD')
                           || upper(substr(replace(id::text, '-', ''), 1, 8))
 where merchant_order_id is null;

create unique index if not exists payments_merchant_order_id_key on payments (merchant_order_id);

alter table payments add column if not exists refund_due boolean not null default false;
