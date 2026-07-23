-- Producer payout management
--
-- Adds:
-- - Platform administrator registry
-- - Producer payout accounts
-- - Payout requests and payout request items
-- - Reserved producer-earning status
-- - Producer and administrator RLS policies
-- - Atomic payout request, cancellation, approval,
--   rejection, and completion functions

create table if not exists public.platform_admins (
  user_id uuid not null,
  created_at timestamptz not null default now(),

  constraint platform_admins_pkey
    primary key (user_id),

  constraint platform_admins_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete cascade
);

create table if not exists public.producer_payout_accounts (
  id uuid not null default gen_random_uuid(),
  producer_id uuid not null,
  account_holder_name text not null,
  iban text not null,
  currency text not null default 'TRY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint producer_payout_accounts_pkey
    primary key (id),

  constraint producer_payout_accounts_producer_id_key
    unique (producer_id),

  constraint producer_payout_accounts_producer_id_fkey
    foreign key (producer_id)
    references public.profiles(id)
    on delete cascade,

  constraint producer_payout_accounts_holder_name_valid
    check (
      char_length(trim(account_holder_name)) >= 2
      and char_length(trim(account_holder_name)) <= 120
    ),

  constraint producer_payout_accounts_iban_valid
    check (
      iban ~ '^TR[0-9]{24}$'
    ),

  constraint producer_payout_accounts_currency_valid
    check (
      currency = 'TRY'
    )
);

create table if not exists public.payout_requests (
  id uuid not null default gen_random_uuid(),
  producer_id uuid not null,
  payout_account_id uuid not null,
  requested_amount numeric not null,
  currency text not null default 'TRY',
  status text not null default 'requested',
  account_holder_name_snapshot text not null,
  iban_snapshot text not null,
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  rejection_reason text,
  bank_transfer_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payout_requests_pkey
    primary key (id),

  constraint payout_requests_producer_id_fkey
    foreign key (producer_id)
    references public.profiles(id)
    on delete restrict,

  constraint payout_requests_payout_account_id_fkey
    foreign key (payout_account_id)
    references public.producer_payout_accounts(id)
    on delete restrict,

  constraint payout_requests_amount_positive
    check (
      requested_amount > 0
    ),

  constraint payout_requests_currency_valid
    check (
      currency = 'TRY'
    ),

  constraint payout_requests_status_valid
    check (
      status in (
        'requested',
        'approved',
        'paid',
        'rejected',
        'cancelled'
      )
    ),

  constraint payout_requests_holder_name_valid
    check (
      char_length(
        trim(account_holder_name_snapshot)
      ) >= 2
      and char_length(
        trim(account_holder_name_snapshot)
      ) <= 120
    ),

  constraint payout_requests_iban_valid
    check (
      iban_snapshot ~ '^TR[0-9]{24}$'
    ),

  constraint payout_requests_approved_timestamp_valid
    check (
      approved_at is null
      or status in (
        'approved',
        'paid',
        'rejected'
      )
    ),

  constraint payout_requests_paid_timestamp_valid
    check (
      paid_at is null
      or status = 'paid'
    ),

  constraint payout_requests_rejected_timestamp_valid
    check (
      rejected_at is null
      or status = 'rejected'
    ),

  constraint payout_requests_cancelled_timestamp_valid
    check (
      cancelled_at is null
      or status = 'cancelled'
    ),

  constraint payout_requests_rejection_reason_valid
    check (
      rejection_reason is null
      or (
        status = 'rejected'
        and char_length(
          trim(rejection_reason)
        ) > 0
      )
    ),

  constraint payout_requests_transfer_reference_valid
    check (
      bank_transfer_reference is null
      or (
        status = 'paid'
        and char_length(
          trim(bank_transfer_reference)
        ) > 0
      )
    )
);

create table if not exists public.payout_request_items (
  id uuid not null default gen_random_uuid(),
  payout_request_id uuid not null,
  producer_earning_id uuid not null,
  amount numeric not null,
  currency text not null default 'TRY',
  status text not null default 'reserved',
  paid_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payout_request_items_pkey
    primary key (id),

  constraint payout_request_items_payout_request_id_fkey
    foreign key (payout_request_id)
    references public.payout_requests(id)
    on delete restrict,

  constraint payout_request_items_producer_earning_id_fkey
    foreign key (producer_earning_id)
    references public.producer_earnings(id)
    on delete restrict,

  constraint payout_request_items_request_earning_unique
    unique (
      payout_request_id,
      producer_earning_id
    ),

  constraint payout_request_items_amount_positive
    check (
      amount > 0
    ),

  constraint payout_request_items_currency_valid
    check (
      currency = 'TRY'
    ),

  constraint payout_request_items_status_valid
    check (
      status in (
        'reserved',
        'paid',
        'released'
      )
    ),

  constraint payout_request_items_paid_timestamp_valid
    check (
      paid_at is null
      or status = 'paid'
    ),

  constraint payout_request_items_released_timestamp_valid
    check (
      released_at is null
      or status = 'released'
    )
);

create unique index if not exists
  payout_requests_one_active_per_producer
on public.payout_requests (
  producer_id
)
where status in (
  'requested',
  'approved'
);

create unique index if not exists
  payout_request_items_active_earning_unique
on public.payout_request_items (
  producer_earning_id
)
where status = 'reserved';

alter table public.producer_earnings
  drop constraint if exists
    producer_earnings_status_valid;

alter table public.producer_earnings
  add constraint producer_earnings_status_valid
  check (
    status in (
      'pending',
      'available',
      'reserved',
      'paid',
      'reversed'
    )
  );

drop trigger if exists
  set_producer_payout_accounts_updated_at
on public.producer_payout_accounts;

create trigger
  set_producer_payout_accounts_updated_at
before update
on public.producer_payout_accounts
for each row
execute function public.set_profile_updated_at();

drop trigger if exists
  set_payout_requests_updated_at
on public.payout_requests;

create trigger
  set_payout_requests_updated_at
before update
on public.payout_requests
for each row
execute function public.set_profile_updated_at();

drop trigger if exists
  set_payout_request_items_updated_at
on public.payout_request_items;

create trigger
  set_payout_request_items_updated_at
before update
on public.payout_request_items
for each row
execute function public.set_profile_updated_at();

alter table public.platform_admins
  enable row level security;

alter table public.producer_payout_accounts
  enable row level security;

alter table public.payout_requests
  enable row level security;

alter table public.payout_request_items
  enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.platform_admins
    where platform_admins.user_id = auth.uid()
  );
$function$;

drop policy if exists
  "Producers can view their own payout account"
on public.producer_payout_accounts;

create policy
  "Producers can view their own payout account"
on public.producer_payout_accounts
for select
to authenticated
using (
  producer_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
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
  producer_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
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
  producer_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_producer = true
  )
)
with check (
  producer_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_producer = true
  )
);

drop policy if exists
  "Producers can view their own payout requests"
on public.payout_requests;

create policy
  "Producers can view their own payout requests"
on public.payout_requests
for select
to authenticated
using (
  producer_id = auth.uid()
);

drop policy if exists
  "Platform admins can view all payout requests"
on public.payout_requests;

create policy
  "Platform admins can view all payout requests"
on public.payout_requests
for select
to authenticated
using (
  public.is_platform_admin()
);

drop policy if exists
  "Producers can view their own payout request items"
on public.payout_request_items;

create policy
  "Producers can view their own payout request items"
on public.payout_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.payout_requests
    where payout_requests.id =
      payout_request_items.payout_request_id
      and payout_requests.producer_id =
        auth.uid()
  )
);

drop policy if exists
  "Platform admins can view all payout request items"
on public.payout_request_items;

create policy
  "Platform admins can view all payout request items"
on public.payout_request_items
for select
to authenticated
using (
  public.is_platform_admin()
);

drop policy if exists
  "Producers can view their own earnings"
on public.producer_earnings;

create policy
  "Producers can view their own earnings"
on public.producer_earnings
for select
to authenticated
using (
  producer_id = auth.uid()
);

drop policy if exists
  "Platform admins can view all producer earnings"
on public.producer_earnings;

create policy
  "Platform admins can view all producer earnings"
on public.producer_earnings
for select
to authenticated
using (
  public.is_platform_admin()
);

create or replace function
  public.request_producer_payout()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  producer_user_id uuid := auth.uid();

  payout_account_id_value uuid;
  account_holder_name_value text;
  iban_value text;
  payout_currency_value text;

  earning_ids uuid[];
  total_requested_amount numeric;

  created_request_id uuid;

  inserted_item_count integer;
  updated_earning_count integer;
begin
  if producer_user_id is null then
    raise exception
      'Authentication is required.';
  end if;

  perform 1
  from public.profiles
  where profiles.id = producer_user_id
    and profiles.is_producer = true
  for update;

  if not found then
    raise exception
      'Only active producers can request payouts.';
  end if;

  select
    producer_payout_accounts.id,
    producer_payout_accounts.account_holder_name,
    producer_payout_accounts.iban,
    producer_payout_accounts.currency
  into
    payout_account_id_value,
    account_holder_name_value,
    iban_value,
    payout_currency_value
  from public.producer_payout_accounts
  where producer_payout_accounts.producer_id =
    producer_user_id;

  if not found then
    raise exception
      'A payout account is required before requesting a payout.';
  end if;

  if exists (
    select 1
    from public.payout_requests
    where payout_requests.producer_id =
      producer_user_id
      and payout_requests.status in (
        'requested',
        'approved'
      )
  ) then
    raise exception
      'You already have an active payout request.';
  end if;

  with locked_earnings as materialized (
    select
      producer_earnings.id,
      producer_earnings.producer_earning_amount
    from public.producer_earnings
    where producer_earnings.producer_id =
      producer_user_id
      and producer_earnings.status = 'available'
      and producer_earnings.currency =
        payout_currency_value
      and not exists (
        select 1
        from public.payout_request_items
        where payout_request_items.producer_earning_id =
          producer_earnings.id
          and payout_request_items.status = 'reserved'
      )
    order by
      producer_earnings.created_at,
      producer_earnings.id
    for update
  )
  select
    array_agg(
      locked_earnings.id
      order by locked_earnings.id
    ),
    coalesce(
      sum(
        locked_earnings.producer_earning_amount
      ),
      0
    )
  into
    earning_ids,
    total_requested_amount
  from locked_earnings;

  if earning_ids is null
    or cardinality(earning_ids) = 0 then
    raise exception
      'There are no available earnings to withdraw.';
  end if;

  if total_requested_amount < 200 then
    raise exception
      'The minimum payout amount is 200 TRY.';
  end if;

  insert into public.payout_requests (
    producer_id,
    payout_account_id,
    requested_amount,
    currency,
    status,
    account_holder_name_snapshot,
    iban_snapshot,
    created_at,
    updated_at
  )
  values (
    producer_user_id,
    payout_account_id_value,
    total_requested_amount,
    payout_currency_value,
    'requested',
    account_holder_name_value,
    iban_value,
    now(),
    now()
  )
  returning id
  into created_request_id;

  insert into public.payout_request_items (
    payout_request_id,
    producer_earning_id,
    amount,
    currency,
    status,
    created_at,
    updated_at
  )
  select
    created_request_id,
    producer_earnings.id,
    producer_earnings.producer_earning_amount,
    producer_earnings.currency,
    'reserved',
    now(),
    now()
  from public.producer_earnings
  where producer_earnings.id =
    any(earning_ids);

  get diagnostics inserted_item_count =
    row_count;

  if inserted_item_count <>
    cardinality(earning_ids) then
    raise exception
      'The payout request items could not be created safely.';
  end if;

  update public.producer_earnings
  set
    status = 'reserved',
    updated_at = now()
  where producer_earnings.id =
    any(earning_ids)
    and producer_earnings.status = 'available';

  get diagnostics updated_earning_count =
    row_count;

  if updated_earning_count <>
    cardinality(earning_ids) then
    raise exception
      'The payout earnings could not be reserved safely.';
  end if;

  return created_request_id;
end;
$function$;

create or replace function
  public.cancel_producer_payout(
    target_payout_request_id uuid
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  producer_user_id uuid := auth.uid();
  released_item_count integer;
  restored_earning_count integer;
begin
  if producer_user_id is null then
    raise exception
      'Authentication is required.';
  end if;

  if target_payout_request_id is null then
    raise exception
      'The payout request ID is required.';
  end if;

  perform 1
  from public.payout_requests
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.producer_id =
      producer_user_id
    and payout_requests.status = 'requested'
  for update;

  if not found then
    raise exception
      'The payout request was not found or cannot be cancelled.';
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
    and producer_earnings.producer_id =
      producer_user_id
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
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where payout_requests.id =
    target_payout_request_id
    and payout_requests.producer_id =
      producer_user_id
    and payout_requests.status = 'requested';

  if not found then
    raise exception
      'The payout request could not be cancelled safely.';
  end if;

  return restored_earning_count;
end;
$function$;

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
on function public.is_platform_admin()
from public;

revoke all
on function public.is_platform_admin()
from anon;

grant execute
on function public.is_platform_admin()
to authenticated;

grant execute
on function public.is_platform_admin()
to service_role;

revoke all
on function public.request_producer_payout()
from public;

revoke all
on function public.request_producer_payout()
from anon;

grant execute
on function public.request_producer_payout()
to authenticated;

grant execute
on function public.request_producer_payout()
to service_role;

revoke all
on function public.cancel_producer_payout(uuid)
from public;

revoke all
on function public.cancel_producer_payout(uuid)
from anon;

grant execute
on function public.cancel_producer_payout(uuid)
to authenticated;

grant execute
on function public.cancel_producer_payout(uuid)
to service_role;

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

grant all
on table public.platform_admins
to anon, authenticated, service_role;

grant all
on table public.producer_payout_accounts
to anon, authenticated, service_role;

grant all
on table public.payout_requests
to anon, authenticated, service_role;

grant all
on table public.payout_request_items
to anon, authenticated, service_role;