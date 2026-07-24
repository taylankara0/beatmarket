revoke all privileges
on table public.payout_requests
from public, anon, authenticated;

grant select
on table public.payout_requests
to authenticated;

revoke all privileges
on table public.payout_request_items
from public, anon, authenticated;

grant select
on table public.payout_request_items
to authenticated;

revoke all privileges
on table public.producer_payout_accounts
from public, anon, authenticated;

grant select, insert, update
on table public.producer_payout_accounts
to authenticated;