/*
  Add covering indexes for foreign-key columns identified
  by the Supabase Performance Advisor.

  These improve joins, relationship checks, and cascading
  or restricted delete operations.
*/

create index if not exists
  beats_producer_id_idx
on public.beats (
  producer_id
);

create index if not exists
  exclusive_beat_reservations_user_id_idx
on public.exclusive_beat_reservations (
  user_id
);

create index if not exists
  licenses_beat_id_idx
on public.licenses (
  beat_id
);

create index if not exists
  orders_beat_id_idx
on public.orders (
  beat_id
);

create index if not exists
  payout_request_items_producer_earning_id_idx
on public.payout_request_items (
  producer_earning_id
);

create index if not exists
  payout_requests_payout_account_id_idx
on public.payout_requests (
  payout_account_id
);

create index if not exists
  payout_requests_producer_id_idx
on public.payout_requests (
  producer_id
);

create index if not exists
  producer_earnings_beat_id_idx
on public.producer_earnings (
  beat_id
);