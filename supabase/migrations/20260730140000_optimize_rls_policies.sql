/*
  Optimize RLS policies by:

  1. Evaluating auth.uid() and is_platform_admin()
     once per statement instead of once per row.

  2. Combining overlapping producer and administrator
     SELECT policies without changing access rules.
*/

drop policy if exists
  "Users can view their own orders"
on public.orders;

create policy
  "Users can view their own orders"
on public.orders
for select
to public
using (
  (select auth.uid()) = user_id
);


drop policy if exists
  "Users can update their own profile"
on public.profiles;

create policy
  "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);


drop policy if exists
  "Producers can view their own payout account"
on public.producer_payout_accounts;

create policy
  "Producers can view their own payout account"
on public.producer_payout_accounts
for select
to authenticated
using (
  producer_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles
    where profiles.id =
      (select auth.uid())
      and profiles.is_producer = true
  )
);


drop policy if exists
  "Producers can create their own payout account"
on public.producer_payout_accounts;

create policy
  "Producers can create their own payout account"
on public.producer_payout_accounts
for insert
to authenticated
with check (
  producer_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles
    where profiles.id =
      (select auth.uid())
      and profiles.is_producer = true
  )
);


drop policy if exists
  "Producers can update their own payout account"
on public.producer_payout_accounts;

create policy
  "Producers can update their own payout account"
on public.producer_payout_accounts
for update
to authenticated
using (
  producer_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles
    where profiles.id =
      (select auth.uid())
      and profiles.is_producer = true
  )
)
with check (
  producer_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles
    where profiles.id =
      (select auth.uid())
      and profiles.is_producer = true
  )
);


drop policy if exists
  "Producers can view their own earnings"
on public.producer_earnings;

drop policy if exists
  "Platform admins can view all producer earnings"
on public.producer_earnings;

create policy
  "Authorized users can view producer earnings"
on public.producer_earnings
for select
to authenticated
using (
  producer_id = (select auth.uid())
  or (select public.is_platform_admin())
);


drop policy if exists
  "Producers can view their own payout requests"
on public.payout_requests;

drop policy if exists
  "Platform admins can view all payout requests"
on public.payout_requests;

create policy
  "Authorized users can view payout requests"
on public.payout_requests
for select
to authenticated
using (
  producer_id = (select auth.uid())
  or (select public.is_platform_admin())
);


drop policy if exists
  "Producers can view their own payout request items"
on public.payout_request_items;

drop policy if exists
  "Platform admins can view all payout request items"
on public.payout_request_items;

create policy
  "Authorized users can view payout request items"
on public.payout_request_items
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.payout_requests
    where payout_requests.id =
      payout_request_items.payout_request_id
      and payout_requests.producer_id =
        (select auth.uid())
  )
);


drop policy if exists
  "Producers can view their own sale email deliveries"
on public.producer_sale_email_deliveries;

drop policy if exists
  "Platform admins can view producer sale email deliveries"
on public.producer_sale_email_deliveries;

create policy
  "Authorized users can view producer sale email deliveries"
on public.producer_sale_email_deliveries
for select
to authenticated
using (
  producer_id = (select auth.uid())
  or (select public.is_platform_admin())
);


drop policy if exists
  "Producers can view their payout status email deliveries"
on public.payout_status_email_deliveries;

drop policy if exists
  "Platform admins can view payout status email deliveries"
on public.payout_status_email_deliveries;

create policy
  "Authorized users can view payout status email deliveries"
on public.payout_status_email_deliveries
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.payout_requests
    where payout_requests.id =
      payout_status_email_deliveries.payout_request_id
      and payout_requests.producer_id =
        (select auth.uid())
  )
);


drop policy if exists
  "Producers can view their own refund email deliveries"
on public.producer_refund_email_deliveries;

drop policy if exists
  "Platform admins can view producer refund email deliveries"
on public.producer_refund_email_deliveries;

create policy
  "Authorized users can view producer refund email deliveries"
on public.producer_refund_email_deliveries
for select
to authenticated
using (
  producer_id = (select auth.uid())
  or (select public.is_platform_admin())
);