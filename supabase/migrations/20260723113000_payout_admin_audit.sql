-- Payout administrator audit trail
--
-- Records which platform administrator:
-- - approved a payout request
-- - rejected a payout request
-- - marked a payout request as paid

alter table public.payout_requests
  add column if not exists approved_by uuid,
  add column if not exists rejected_by uuid,
  add column if not exists paid_by uuid;

alter table public.payout_requests
  drop constraint if exists
    payout_requests_approved_by_valid;

alter table public.payout_requests
  drop constraint if exists
    payout_requests_rejected_by_valid;

alter table public.payout_requests
  drop constraint if exists
    payout_requests_paid_by_valid;

alter table public.payout_requests
  add constraint payout_requests_approved_by_valid
  check (
    approved_by is null
    or status in (
      'approved',
      'paid',
      'rejected'
    )
  );

alter table public.payout_requests
  add constraint payout_requests_rejected_by_valid
  check (
    rejected_by is null
    or status = 'rejected'
  );

alter table public.payout_requests
  add constraint payout_requests_paid_by_valid
  check (
    paid_by is null
    or status = 'paid'
  );

create or replace function
  public.approve_producer_payout(
    target_payout_request_id uuid
  )
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  admin_user_id uuid := auth.uid();
begin
  if admin_user_id is null then
    raise exception
      'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id =
      admin_user_id
  ) then
    raise exception
      'Administrator access is required.';
  end if;

  if target_payout_request_id is null then
    raise exception
      'The payout request ID is required.';
  end if;

  perform 1
  from public.payout_requests
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status = 'requested'
  for update;

  if not found then
    raise exception
      'The payout request was not found or cannot be approved.';
  end if;

  update public.payout_requests
  set
    status = 'approved',
    approved_at = now(),
    approved_by = admin_user_id,
    updated_at = now()
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status = 'requested';

  if not found then
    raise exception
      'The payout request could not be approved safely.';
  end if;
end;
$function$;

create or replace function
  public.reject_producer_payout(
    target_payout_request_id uuid,
    rejection_reason_value text
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  admin_user_id uuid := auth.uid();
  released_item_count integer;
  restored_earning_count integer;
begin
  if admin_user_id is null then
    raise exception
      'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id =
      admin_user_id
  ) then
    raise exception
      'Administrator access is required.';
  end if;

  if target_payout_request_id is null then
    raise exception
      'The payout request ID is required.';
  end if;

  if rejection_reason_value is null
    or char_length(
      trim(rejection_reason_value)
    ) = 0 then
    raise exception
      'A rejection reason is required.';
  end if;

  perform 1
  from public.payout_requests
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status in (
      'requested',
      'approved'
    )
  for update;

  if not found then
    raise exception
      'The payout request was not found or cannot be rejected.';
  end if;

  update public.producer_earnings
  set
    status = 'available',
    updated_at = now()
  where producer_earnings.id in (
    select
      payout_request_items.producer_earning_id
    from public.payout_request_items
    where payout_request_items.payout_request_id =
      target_payout_request_id
      and payout_request_items.status = 'reserved'
  )
    and producer_earnings.status = 'reserved';

  get diagnostics restored_earning_count =
    row_count;

  update public.payout_request_items
  set
    status = 'released',
    released_at = now(),
    updated_at = now()
  where payout_request_items.payout_request_id =
    target_payout_request_id
    and payout_request_items.status = 'reserved';

  get diagnostics released_item_count =
    row_count;

  if released_item_count = 0 then
    raise exception
      'The payout request has no reserved earnings.';
  end if;

  if restored_earning_count <>
    released_item_count then
    raise exception
      'The payout earnings could not be restored safely.';
  end if;

  update public.payout_requests
  set
    status = 'rejected',
    rejected_at = now(),
    rejected_by = admin_user_id,
    rejection_reason =
      trim(rejection_reason_value),
    updated_at = now()
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status in (
      'requested',
      'approved'
    );

  if not found then
    raise exception
      'The payout request could not be rejected safely.';
  end if;

  return restored_earning_count;
end;
$function$;

create or replace function
  public.complete_producer_payout(
    target_payout_request_id uuid,
    bank_transfer_reference_value text
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  admin_user_id uuid := auth.uid();

  request_producer_id uuid;
  request_amount numeric;
  request_currency text;

  reserved_item_count integer;
  reserved_item_amount numeric;
  records_are_consistent boolean;

  paid_earning_count integer;
  paid_item_count integer;
begin
  if admin_user_id is null then
    raise exception
      'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id =
      admin_user_id
  ) then
    raise exception
      'Administrator access is required.';
  end if;

  if target_payout_request_id is null then
    raise exception
      'The payout request ID is required.';
  end if;

  if bank_transfer_reference_value is null
    or char_length(
      trim(bank_transfer_reference_value)
    ) = 0 then
    raise exception
      'A bank transfer reference is required.';
  end if;

  select
    payout_requests.producer_id,
    payout_requests.requested_amount,
    payout_requests.currency
  into
    request_producer_id,
    request_amount,
    request_currency
  from public.payout_requests
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status = 'approved'
  for update;

  if not found then
    raise exception
      'The payout request was not found or is not approved.';
  end if;

  perform 1
  from public.payout_request_items
  inner join public.producer_earnings
    on producer_earnings.id =
      payout_request_items.producer_earning_id
  where payout_request_items.payout_request_id =
    target_payout_request_id
  for update of
    payout_request_items,
    producer_earnings;

  select
    count(*),
    coalesce(
      sum(payout_request_items.amount),
      0
    ),
    coalesce(
      bool_and(
        payout_request_items.status = 'reserved'
        and payout_request_items.currency =
          request_currency
        and producer_earnings.status = 'reserved'
        and producer_earnings.producer_id =
          request_producer_id
        and producer_earnings.currency =
          payout_request_items.currency
        and producer_earnings.producer_earning_amount =
          payout_request_items.amount
      ),
      false
    )
  into
    reserved_item_count,
    reserved_item_amount,
    records_are_consistent
  from public.payout_request_items
  inner join public.producer_earnings
    on producer_earnings.id =
      payout_request_items.producer_earning_id
  where payout_request_items.payout_request_id =
    target_payout_request_id;

  if reserved_item_count = 0 then
    raise exception
      'The payout request has no reserved earnings.';
  end if;

  if records_are_consistent is not true then
    raise exception
      'The payout records are not consistent.';
  end if;

  if reserved_item_amount <> request_amount then
    raise exception
      'The payout item total does not match the requested amount.';
  end if;

  update public.producer_earnings
  set
    status = 'paid',
    paid_out_at = now(),
    updated_at = now()
  where producer_earnings.id in (
    select
      payout_request_items.producer_earning_id
    from public.payout_request_items
    where payout_request_items.payout_request_id =
      target_payout_request_id
      and payout_request_items.status = 'reserved'
  )
    and producer_earnings.producer_id =
      request_producer_id
    and producer_earnings.status = 'reserved';

  get diagnostics paid_earning_count =
    row_count;

  if paid_earning_count <>
    reserved_item_count then
    raise exception
      'The producer earnings could not be marked as paid safely.';
  end if;

  update public.payout_request_items
  set
    status = 'paid',
    paid_at = now(),
    updated_at = now()
  where payout_request_items.payout_request_id =
    target_payout_request_id
    and payout_request_items.status = 'reserved';

  get diagnostics paid_item_count =
    row_count;

  if paid_item_count <>
    reserved_item_count then
    raise exception
      'The payout items could not be marked as paid safely.';
  end if;

  update public.payout_requests
  set
    status = 'paid',
    paid_at = now(),
    paid_by = admin_user_id,
    bank_transfer_reference =
      trim(bank_transfer_reference_value),
    updated_at = now()
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.status = 'approved';

  if not found then
    raise exception
      'The payout request could not be completed safely.';
  end if;

  return paid_earning_count;
end;
$function$;

revoke all
on function public.approve_producer_payout(uuid)
from public;

revoke all
on function public.approve_producer_payout(uuid)
from anon;

grant execute
on function public.approve_producer_payout(uuid)
to authenticated;

grant execute
on function public.approve_producer_payout(uuid)
to service_role;

revoke all
on function public.reject_producer_payout(uuid, text)
from public;

revoke all
on function public.reject_producer_payout(uuid, text)
from anon;

grant execute
on function public.reject_producer_payout(uuid, text)
to authenticated;

grant execute
on function public.reject_producer_payout(uuid, text)
to service_role;

revoke all
on function public.complete_producer_payout(uuid, text)
from public;

revoke all
on function public.complete_producer_payout(uuid, text)
from anon;

grant execute
on function public.complete_producer_payout(uuid, text)
to authenticated;

grant execute
on function public.complete_producer_payout(uuid, text)
to service_role;