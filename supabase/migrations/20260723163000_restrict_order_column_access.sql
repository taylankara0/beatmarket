revoke select
on table public.orders
from public, anon, authenticated;

grant select (
  id,
  user_id,
  public_id,
  status,
  price,
  paid_price,
  currency,
  payment_provider,
  payment_status,
  paid_at,
  created_at,
  updated_at,
  refunded_at
)
on table public.orders
to authenticated;