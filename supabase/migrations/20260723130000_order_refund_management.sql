begin;

alter table public.orders
  add column if not exists
    refunded_at timestamptz;

alter table public.orders
  drop constraint if exists
    orders_refunded_timestamp_valid;

alter table public.orders
  add constraint
    orders_refunded_timestamp_valid
  check (
    refunded_at is null
    or status = 'refunded'
  );

create table public.order_refunds (
  id uuid
    primary key
    default gen_random_uuid(),

  order_id uuid
    not null
    references public.orders(id)
    on delete restrict,

  created_by uuid
    not null,

  provider text
    not null
    default 'iyzico',

  provider_payment_id_snapshot text
    not null,

  provider_conversation_id_snapshot text,

  requested_amount numeric(12, 2)
    not null,

  refunded_amount numeric(12, 2)
    not null
    default 0,

  currency text
    not null,

  status text
    not null
    default 'pending',

  refund_reason text
    not null,

  restore_exclusive_beats boolean
    not null
    default false,

  last_error text,

  requested_at timestamptz
    not null
    default now(),

  started_at timestamptz,

  completed_at timestamptz,

  failed_at timestamptz,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint order_refunds_order_unique
    unique (order_id),

  constraint order_refunds_provider_valid
    check (
      provider = 'iyzico'
    ),

  constraint order_refunds_requested_amount_positive
    check (
      requested_amount > 0
    ),

  constraint order_refunds_refunded_amount_valid
    check (
      refunded_amount >= 0
      and refunded_amount <= requested_amount
    ),

  constraint order_refunds_currency_format
    check (
      char_length(currency) = 3
      and currency = upper(currency)
    ),

  constraint order_refunds_status_valid
    check (
      status in (
        'pending',
        'processing',
        'failed',
        'manual_review',
        'refunded'
      )
    ),

  constraint order_refunds_reason_valid
    check (
      char_length(
        trim(refund_reason)
      ) between 2 and 500
    ),

  constraint order_refunds_completed_timestamp_valid
    check (
      completed_at is null
      or status = 'refunded'
    ),

  constraint order_refunds_failed_timestamp_valid
    check (
      failed_at is null
      or status in (
        'failed',
        'manual_review'
      )
    ),

  constraint order_refunds_last_error_valid
    check (
      last_error is null
      or status in (
        'failed',
        'manual_review'
      )
    )
);

create table public.order_refund_items (
  id uuid
    primary key
    default gen_random_uuid(),

  order_refund_id uuid
    not null
    references public.order_refunds(id)
    on delete restrict,

  order_item_id uuid
    not null
    references public.order_items(id)
    on delete restrict,

  provider_item_id text
    not null,

  payment_transaction_id text
    not null,

  amount numeric(12, 2)
    not null,

  currency text
    not null,

  status text
    not null
    default 'pending',

  provider_response jsonb,

  failure_reason text,

  refunded_at timestamptz,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint order_refund_items_order_item_unique
    unique (order_item_id),

  constraint order_refund_items_refund_order_item_unique
    unique (
      order_refund_id,
      order_item_id
    ),

  constraint order_refund_items_provider_item_valid
    check (
      char_length(
        trim(provider_item_id)
      ) > 0
    ),

  constraint order_refund_items_transaction_valid
    check (
      char_length(
        trim(payment_transaction_id)
      ) > 0
    ),

  constraint order_refund_items_amount_positive
    check (
      amount > 0
    ),

  constraint order_refund_items_currency_format
    check (
      char_length(currency) = 3
      and currency = upper(currency)
    ),

  constraint order_refund_items_status_valid
    check (
      status in (
        'pending',
        'refunded',
        'failed'
      )
    ),

  constraint order_refund_items_refunded_timestamp_valid
    check (
      refunded_at is null
      or status = 'refunded'
    ),

  constraint order_refund_items_failure_reason_valid
    check (
      failure_reason is null
      or (
        status = 'failed'
        and char_length(
          trim(failure_reason)
        ) > 0
      )
    )
);

create index order_refunds_status_created_at_idx
  on public.order_refunds(
    status,
    created_at desc
  );

create index order_refunds_created_by_idx
  on public.order_refunds(
    created_by
  );

create index order_refund_items_refund_status_idx
  on public.order_refund_items(
    order_refund_id,
    status
  );

comment on table public.order_refunds is
  'Administrative full-order refund records for verified Iyzico payments.';

comment on column public.order_refunds.restore_exclusive_beats is
  'When true, successful refund finalization restores this order''s Exclusive beats for sale. The safe default is false.';

comment on table public.order_refund_items is
  'One provider refund transaction record for each refunded order item.';

create or replace function
  public.set_order_refund_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();

  return new;
end;
$function$;

drop trigger if exists
  set_order_refunds_updated_at
on public.order_refunds;

create trigger
  set_order_refunds_updated_at
before update
on public.order_refunds
for each row
execute function
  public.set_order_refund_updated_at();

drop trigger if exists
  set_order_refund_items_updated_at
on public.order_refund_items;

create trigger
  set_order_refund_items_updated_at
before update
on public.order_refund_items
for each row
execute function
  public.set_order_refund_updated_at();

alter table public.order_refunds
  enable row level security;

alter table public.order_refund_items
  enable row level security;

create policy
  "Platform admins can view all order refunds"
on public.order_refunds
for select
to authenticated
using (
  public.is_platform_admin()
);

create policy
  "Platform admins can view all order refund items"
on public.order_refund_items
for select
to authenticated
using (
  public.is_platform_admin()
);

create or replace function
  public.create_order_refund(
    target_order_id uuid,
    refund_reason_value text,
    restore_exclusive_beats_value boolean
      default false
  )
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  admin_user_id uuid :=
    auth.uid();

  order_status_value text;
  order_paid_price_value numeric;
  order_currency_value text;
  order_payment_id_value text;
  order_conversation_id_value text;

  existing_refund_id uuid;
  created_refund_id uuid;

  order_item_count integer;
  invalid_transaction_item_count integer;
  order_item_total numeric;

  earning_count integer;
  reserved_earning_count integer;
  paid_earning_count integer;
  invalid_earning_count integer;

  inserted_item_count integer;
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

  if target_order_id is null then
    raise exception
      'The order ID is required.';
  end if;

  if refund_reason_value is null
    or char_length(
      trim(refund_reason_value)
    ) < 2 then
    raise exception
      'A refund reason of at least two characters is required.';
  end if;

  if char_length(
    trim(refund_reason_value)
  ) > 500 then
    raise exception
      'The refund reason cannot exceed 500 characters.';
  end if;

  select
    orders.status,
    orders.paid_price,
    orders.currency,
    orders.payment_id,
    orders.conversation_id
  into
    order_status_value,
    order_paid_price_value,
    order_currency_value,
    order_payment_id_value,
    order_conversation_id_value
  from public.orders
  where orders.id =
    target_order_id
  for update;

  if not found then
    raise exception
      'The order was not found.';
  end if;

  select
    order_refunds.id
  into
    existing_refund_id
  from public.order_refunds
  where order_refunds.order_id =
    target_order_id;

  if found then
    return existing_refund_id;
  end if;

  if order_status_value <> 'paid' then
    raise exception
      'Only paid orders can be refunded.';
  end if;

  if order_paid_price_value is null
    or order_paid_price_value <= 0 then
    raise exception
      'The paid order amount is invalid.';
  end if;

  if order_currency_value is null
    or char_length(
      order_currency_value
    ) <> 3 then
    raise exception
      'The order currency is invalid.';
  end if;

  if order_payment_id_value is null
    or char_length(
      trim(order_payment_id_value)
    ) = 0 then
    raise exception
      'The Iyzico payment ID is missing.';
  end if;

  perform 1
  from public.order_items
  where order_items.order_id =
    target_order_id
  for update;

  select
    count(*),

    count(*) filter (
      where
        order_items.payment_transaction_id
          is null
        or char_length(
          trim(
            order_items.payment_transaction_id
          )
        ) = 0
        or order_items.iyzico_item_id
          is null
        or char_length(
          trim(
            order_items.iyzico_item_id
          )
        ) = 0
        or order_items.iyzico_paid_price
          is null
        or order_items.iyzico_paid_price <= 0
    ),

    coalesce(
      sum(
        order_items.iyzico_paid_price
      ),
      0
    )
  into
    order_item_count,
    invalid_transaction_item_count,
    order_item_total
  from public.order_items
  where order_items.order_id =
    target_order_id;

  if order_item_count = 0 then
    raise exception
      'The order has no order items.';
  end if;

  if invalid_transaction_item_count > 0 then
    raise exception
      'One or more order items are missing valid Iyzico transaction information.';
  end if;

  if round(
    order_item_total,
    2
  ) <> round(
    order_paid_price_value,
    2
  ) then
    raise exception
      'The order item transaction total does not match the paid order amount.';
  end if;

  perform 1
  from public.producer_earnings
  where producer_earnings.order_id =
    target_order_id
  for update;

  select
    count(*),

    count(*) filter (
      where producer_earnings.status =
        'reserved'
    ),

    count(*) filter (
      where producer_earnings.status =
        'paid'
    ),

    count(*) filter (
      where producer_earnings.status
        not in (
          'pending',
          'available'
        )
    )
  into
    earning_count,
    reserved_earning_count,
    paid_earning_count,
    invalid_earning_count
  from public.producer_earnings
  where producer_earnings.order_id =
    target_order_id;

  if earning_count <> order_item_count then
    raise exception
      'The order does not have one producer earning record for every order item.';
  end if;

  if reserved_earning_count > 0 then
    raise exception
      'This order has earnings reserved in an active payout request. Reject or cancel that payout request before refunding the order.';
  end if;

  if paid_earning_count > 0 then
    raise exception
      'This order contains earnings that have already been paid to a producer. Automatic refund recovery is not yet supported.';
  end if;

  if invalid_earning_count > 0 then
    raise exception
      'The order contains earnings that cannot be refunded automatically.';
  end if;

  insert into public.order_refunds (
    order_id,
    created_by,
    provider,
    provider_payment_id_snapshot,
    provider_conversation_id_snapshot,
    requested_amount,
    refunded_amount,
    currency,
    status,
    refund_reason,
    restore_exclusive_beats,
    requested_at,
    created_at,
    updated_at
  )
  values (
    target_order_id,
    admin_user_id,
    'iyzico',
    trim(order_payment_id_value),
    order_conversation_id_value,
    round(
      order_paid_price_value,
      2
    ),
    0,
    upper(order_currency_value),
    'pending',
    trim(refund_reason_value),
    coalesce(
      restore_exclusive_beats_value,
      false
    ),
    now(),
    now(),
    now()
  )
  returning id
  into created_refund_id;

  insert into public.order_refund_items (
    order_refund_id,
    order_item_id,
    provider_item_id,
    payment_transaction_id,
    amount,
    currency,
    status,
    created_at,
    updated_at
  )
  select
    created_refund_id,
    order_items.id,
    trim(order_items.iyzico_item_id),
    trim(
      order_items.payment_transaction_id
    ),
    round(
      order_items.iyzico_paid_price,
      2
    ),
    upper(order_items.currency),
    'pending',
    now(),
    now()
  from public.order_items
  where order_items.order_id =
    target_order_id
  order by
    order_items.created_at,
    order_items.id;

  get diagnostics inserted_item_count =
    row_count;

  if inserted_item_count <>
    order_item_count then
    raise exception
      'The refund items could not be created safely.';
  end if;

  return created_refund_id;
end;
$function$;

create or replace function
  public.start_order_refund(
    target_order_refund_id uuid
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  refund_status_value text;
  pending_item_count integer;
begin
  if target_order_refund_id is null then
    raise exception
      'The refund ID is required.';
  end if;

  select
    order_refunds.status
  into
    refund_status_value
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if not found then
    raise exception
      'The refund was not found.';
  end if;

  if refund_status_value = 'refunded' then
    return 0;
  end if;

  update public.order_refund_items
  set
    status = 'pending',
    failure_reason = null,
    refunded_at = null,
    updated_at = now()
  where order_refund_items.order_refund_id =
    target_order_refund_id
    and order_refund_items.status =
      'failed';

  update public.order_refunds
  set
    status = 'processing',
    started_at = coalesce(
      started_at,
      now()
    ),
    failed_at = null,
    last_error = null,
    updated_at = now()
  where order_refunds.id =
    target_order_refund_id
    and order_refunds.status <>
      'refunded';

  select
    count(*)
  into
    pending_item_count
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id
    and order_refund_items.status =
      'pending';

  return pending_item_count;
end;
$function$;

create or replace function
  public.record_order_refund_item_result(
    target_order_refund_item_id uuid,
    succeeded boolean,
    provider_response_value jsonb,
    failure_reason_value text
      default null
  )
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_order_refund_id uuid;
  current_item_status text;
  current_refund_status text;

  total_item_count integer;
  refunded_item_count integer;
  failed_item_count integer;
  refunded_amount_value numeric;

  next_refund_status text;
begin
  if target_order_refund_item_id
    is null then
    raise exception
      'The refund item ID is required.';
  end if;

  if succeeded is null then
    raise exception
      'The refund result is required.';
  end if;

  if succeeded is false
    and (
      failure_reason_value is null
      or char_length(
        trim(failure_reason_value)
      ) = 0
    ) then
    raise exception
      'A failure reason is required for a failed refund item.';
  end if;

  select
    order_refund_items.order_refund_id,
    order_refund_items.status
  into
    target_order_refund_id,
    current_item_status
  from public.order_refund_items
  where order_refund_items.id =
    target_order_refund_item_id
  for update;

  if not found then
    raise exception
      'The refund item was not found.';
  end if;

  select
    order_refunds.status
  into
    current_refund_status
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if current_refund_status =
    'refunded' then
    return current_refund_status;
  end if;

  if current_item_status =
      'refunded'
    and succeeded is true then
    return current_refund_status;
  end if;

  if current_item_status =
      'refunded'
    and succeeded is false then
    raise exception
      'A successfully refunded item cannot be changed to failed.';
  end if;

  if succeeded is true then
    update public.order_refund_items
    set
      status = 'refunded',
      provider_response =
        provider_response_value,
      failure_reason = null,
      refunded_at = now(),
      updated_at = now()
    where order_refund_items.id =
      target_order_refund_item_id;
  else
    update public.order_refund_items
    set
      status = 'failed',
      provider_response =
        provider_response_value,
      failure_reason =
        trim(failure_reason_value),
      refunded_at = null,
      updated_at = now()
    where order_refund_items.id =
      target_order_refund_item_id;
  end if;

  select
    count(*),

    count(*) filter (
      where order_refund_items.status =
        'refunded'
    ),

    count(*) filter (
      where order_refund_items.status =
        'failed'
    ),

    coalesce(
      sum(
        order_refund_items.amount
      ) filter (
        where order_refund_items.status =
          'refunded'
      ),
      0
    )
  into
    total_item_count,
    refunded_item_count,
    failed_item_count,
    refunded_amount_value
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id;

  if total_item_count = 0 then
    raise exception
      'The refund has no items.';
  end if;

  if refunded_item_count =
    total_item_count then
    next_refund_status :=
      'processing';
  elsif refunded_item_count > 0
    and failed_item_count > 0 then
    next_refund_status :=
      'manual_review';
  elsif failed_item_count > 0 then
    next_refund_status :=
      'failed';
  else
    next_refund_status :=
      'processing';
  end if;

  update public.order_refunds
  set
    status = next_refund_status,
    refunded_amount = round(
      refunded_amount_value,
      2
    ),

    failed_at =
      case
        when next_refund_status in (
          'failed',
          'manual_review'
        )
        then now()
        else null
      end,

    last_error =
      case
        when next_refund_status in (
          'failed',
          'manual_review'
        )
        then trim(
          failure_reason_value
        )
        else null
      end,

    updated_at = now()
  where order_refunds.id =
    target_order_refund_id;

  return next_refund_status;
end;
$function$;

create or replace function
  public.finalize_order_refund(
    target_order_refund_id uuid
  )
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_order_id uuid;
  refund_status_value text;
  requested_amount_value numeric;
  refunded_amount_value numeric;
  restore_exclusive_beats_value boolean;

  order_status_value text;

  refund_item_count integer;
  refunded_item_count integer;
  refund_item_total numeric;

  earning_count integer;
  invalid_earning_count integer;
  reversed_earning_count integer;
  total_reversed_earning_count integer;
begin
  if target_order_refund_id
    is null then
    raise exception
      'The refund ID is required.';
  end if;

  select
    order_refunds.order_id,
    order_refunds.status,
    order_refunds.requested_amount,
    order_refunds.refunded_amount,
    order_refunds.restore_exclusive_beats
  into
    target_order_id,
    refund_status_value,
    requested_amount_value,
    refunded_amount_value,
    restore_exclusive_beats_value
  from public.order_refunds
  where order_refunds.id =
    target_order_refund_id
  for update;

  if not found then
    raise exception
      'The refund was not found.';
  end if;

  if refund_status_value =
    'refunded' then
    return 0;
  end if;

  select
    orders.status
  into
    order_status_value
  from public.orders
  where orders.id =
    target_order_id
  for update;

  if not found then
    raise exception
      'The refund order was not found.';
  end if;

  if order_status_value <>
    'paid' then
    raise exception
      'The order is not in a refundable paid state.';
  end if;

  perform 1
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id
  for update;

  select
    count(*),

    count(*) filter (
      where order_refund_items.status =
        'refunded'
    ),

    coalesce(
      sum(
        order_refund_items.amount
      ) filter (
        where order_refund_items.status =
          'refunded'
      ),
      0
    )
  into
    refund_item_count,
    refunded_item_count,
    refund_item_total
  from public.order_refund_items
  where order_refund_items.order_refund_id =
    target_order_refund_id;

  if refund_item_count = 0 then
    raise exception
      'The refund has no items.';
  end if;

  if refunded_item_count <>
    refund_item_count then
    raise exception
      'All refund items must succeed before the refund can be finalized.';
  end if;

  if round(
    refund_item_total,
    2
  ) <> round(
    requested_amount_value,
    2
  ) then
    raise exception
      'The refunded item total does not match the requested refund amount.';
  end if;

  if round(
    refunded_amount_value,
    2
  ) <> round(
    requested_amount_value,
    2
  ) then
    raise exception
      'The recorded refunded amount does not match the requested refund amount.';
  end if;

  perform 1
  from public.producer_earnings
  where producer_earnings.order_id =
    target_order_id
  for update;

  select
    count(*),

    count(*) filter (
      where producer_earnings.status
        not in (
          'pending',
          'available',
          'reversed'
        )
    )
  into
    earning_count,
    invalid_earning_count
  from public.producer_earnings
  where producer_earnings.order_id =
    target_order_id;

  if earning_count <>
    refund_item_count then
    raise exception
      'The refund does not have one producer earning record for every refund item.';
  end if;

  if invalid_earning_count > 0 then
    raise exception
      'One or more producer earnings can no longer be reversed safely.';
  end if;

  update public.producer_earnings
  set
    status = 'reversed',
    reversed_at = now(),
    updated_at = now()
  where producer_earnings.order_id =
    target_order_id
    and producer_earnings.status in (
      'pending',
      'available'
    );

  get diagnostics reversed_earning_count =
    row_count;

  select
    count(*)
  into
    total_reversed_earning_count
  from public.producer_earnings
  where producer_earnings.order_id =
    target_order_id
    and producer_earnings.status =
      'reversed';

  if total_reversed_earning_count <>
    earning_count then
    raise exception
      'The producer earnings could not be reversed safely.';
  end if;

  if restore_exclusive_beats_value
    is true then
    perform 1
    from public.exclusive_beat_reservations
    where
      exclusive_beat_reservations.order_id =
        target_order_id
      and exclusive_beat_reservations.status =
        'paid'
    for update;

    update public.beats
    set
      is_sold_exclusive = false
    where beats.id in (
      select
        exclusive_beat_reservations.beat_id
      from public.exclusive_beat_reservations
      where
        exclusive_beat_reservations.order_id =
          target_order_id
        and exclusive_beat_reservations.status =
          'paid'
    );

    delete from
      public.exclusive_beat_reservations
    where
      exclusive_beat_reservations.order_id =
        target_order_id
      and exclusive_beat_reservations.status =
        'paid';
  end if;

  update public.orders
  set
    status = 'refunded',
    payment_status = 'REFUNDED',
    refunded_at = now(),
    failure_reason = null,
    updated_at = now()
  where orders.id =
    target_order_id
    and orders.status =
      'paid';

  if not found then
    raise exception
      'The order could not be marked as refunded safely.';
  end if;

  update public.order_refunds
  set
    status = 'refunded',
    refunded_amount =
      requested_amount,
    completed_at = now(),
    failed_at = null,
    last_error = null,
    updated_at = now()
  where order_refunds.id =
    target_order_refund_id
    and order_refunds.status <>
      'refunded';

  if not found then
    raise exception
      'The refund could not be finalized safely.';
  end if;

  return reversed_earning_count;
end;
$function$;

revoke all
on table public.order_refunds
from public;

revoke all
on table public.order_refunds
from anon;

revoke all
on table public.order_refunds
from authenticated;

grant select
on table public.order_refunds
to authenticated;

grant all
on table public.order_refunds
to service_role;

revoke all
on table public.order_refund_items
from public;

revoke all
on table public.order_refund_items
from anon;

revoke all
on table public.order_refund_items
from authenticated;

grant select
on table public.order_refund_items
to authenticated;

grant all
on table public.order_refund_items
to service_role;

revoke all
on function public.create_order_refund(
  uuid,
  text,
  boolean
)
from public;

revoke all
on function public.create_order_refund(
  uuid,
  text,
  boolean
)
from anon;

grant execute
on function public.create_order_refund(
  uuid,
  text,
  boolean
)
to authenticated;

grant execute
on function public.create_order_refund(
  uuid,
  text,
  boolean
)
to service_role;

revoke all
on function public.start_order_refund(uuid)
from public;

revoke all
on function public.start_order_refund(uuid)
from anon;

revoke all
on function public.start_order_refund(uuid)
from authenticated;

grant execute
on function public.start_order_refund(uuid)
to service_role;

revoke all
on function public.record_order_refund_item_result(
  uuid,
  boolean,
  jsonb,
  text
)
from public;

revoke all
on function public.record_order_refund_item_result(
  uuid,
  boolean,
  jsonb,
  text
)
from anon;

revoke all
on function public.record_order_refund_item_result(
  uuid,
  boolean,
  jsonb,
  text
)
from authenticated;

grant execute
on function public.record_order_refund_item_result(
  uuid,
  boolean,
  jsonb,
  text
)
to service_role;

revoke all
on function public.finalize_order_refund(uuid)
from public;

revoke all
on function public.finalize_order_refund(uuid)
from anon;

revoke all
on function public.finalize_order_refund(uuid)
from authenticated;

grant execute
on function public.finalize_order_refund(uuid)
to service_role;

commit;