revoke insert, update
on table public.producer_payout_accounts
from authenticated;

grant insert (
  producer_id,
  account_holder_name,
  iban,
  currency
)
on table public.producer_payout_accounts
to authenticated;

grant update (
  producer_id,
  account_holder_name,
  iban,
  currency
)
on table public.producer_payout_accounts
to authenticated;