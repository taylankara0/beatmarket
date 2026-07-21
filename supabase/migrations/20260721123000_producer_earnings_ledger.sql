begin;

alter table public.order_items
  add column producer_id uuid;

update public.order_items
set producer_id = beats.producer_id
from public.beats
where beats.id = order_items.beat_id;

alter table public.order_items
  alter column producer_id
    set not null;

alter table public.order_items
  add constraint order_items_producer_id_fkey
    foreign key (producer_id)
    references public.profiles(id)
    on delete restrict;

create index order_items_producer_id_idx
  on public.order_items(producer_id);

comment on column public.order_items.producer_id is
  'Immutable producer ownership snapshot captured when the order item is created.';

create table public.producer_earnings (
  id uuid
    primary key
    default gen_random_uuid(),

  order_id uuid
    not null
    references public.orders(id)
    on delete restrict,

  order_item_id uuid
    not null
    references public.order_items(id)
    on delete restrict,

  producer_id uuid
    not null
    references public.profiles(id)
    on delete restrict,

  beat_id uuid
    not null
    references public.beats(id)
    on delete restrict,

  gross_amount numeric(12, 2)
    not null,

  platform_fee_amount numeric(12, 2)
    not null,

  producer_earning_amount numeric(12, 2)
    not null,

  commission_rate numeric(5, 2)
    not null,

  currency text
    not null,

  status text
    not null
    default 'pending',

  available_at timestamp with time zone
    not null,

  paid_out_at timestamp with time zone,

  reversed_at timestamp with time zone,

  created_at timestamp with time zone
    not null
    default now(),

  updated_at timestamp with time zone
    not null
    default now(),

  constraint producer_earnings_order_item_unique
    unique (order_item_id),

  constraint producer_earnings_gross_nonnegative
    check (
      gross_amount >= 0
    ),

  constraint producer_earnings_platform_fee_nonnegative
    check (
      platform_fee_amount >= 0
    ),

  constraint producer_earnings_amount_nonnegative
    check (
      producer_earning_amount >= 0
    ),

  constraint producer_earnings_commission_rate_range
    check (
      commission_rate >= 0
      and commission_rate <= 100
    ),

  constraint producer_earnings_split_matches
    check (
      gross_amount =
      platform_fee_amount +
      producer_earning_amount
    ),

  constraint producer_earnings_currency_format
    check (
      char_length(currency) = 3
      and currency = upper(currency)
    ),

  constraint producer_earnings_status_valid
    check (
      status in (
        'pending',
        'available',
        'paid',
        'reversed'
      )
    ),

  constraint producer_earnings_paid_timestamp_valid
    check (
      paid_out_at is null
      or status = 'paid'
    ),

  constraint producer_earnings_reversed_timestamp_valid
    check (
      reversed_at is null
      or status = 'reversed'
    )
);

create index producer_earnings_producer_status_idx
  on public.producer_earnings(
    producer_id,
    status
  );

create index producer_earnings_available_at_idx
  on public.producer_earnings(
    available_at
  )
  where status = 'pending';

create index producer_earnings_order_id_idx
  on public.producer_earnings(
    order_id
  );

comment on table public.producer_earnings is
  'Immutable producer earnings ledger created only for verified paid order items.';

comment on column public.producer_earnings.status is
  'Earning lifecycle: pending, available, paid, or reversed.';

comment on column public.producer_earnings.available_at is
  'Timestamp when the seven-day earnings hold period ends.';

create or replace function public.create_producer_earnings_for_order(
  target_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if target_order_id is null then
    raise exception
      'The target order ID is required.';
  end if;

  if not exists (
    select 1
    from public.orders
    where orders.id = target_order_id
      and orders.status = 'paid'
  ) then
    raise exception
      'Producer earnings can only be created for a paid order.';
  end if;

  insert into public.producer_earnings (
    order_id,
    order_item_id,
    producer_id,
    beat_id,
    gross_amount,
    platform_fee_amount,
    producer_earning_amount,
    commission_rate,
    currency,
    status,
    available_at,
    created_at,
    updated_at
  )
  select
    orders.id,
    order_items.id,
    order_items.producer_id,
    order_items.beat_id,
    order_items.gross_amount,
    order_items.platform_fee_amount,
    order_items.producer_earning_amount,
    order_items.commission_rate,
    order_items.currency,

    case
      when
        coalesce(
          orders.paid_at,
          orders.updated_at,
          orders.created_at,
          now()
        ) + interval '7 days' <= now()
      then 'available'
      else 'pending'
    end,

    coalesce(
      orders.paid_at,
      orders.updated_at,
      orders.created_at,
      now()
    ) + interval '7 days',

    coalesce(
      orders.paid_at,
      orders.updated_at,
      orders.created_at,
      now()
    ),

    now()
  from public.orders
  inner join public.order_items
    on order_items.order_id = orders.id
  where orders.id = target_order_id
    and orders.status = 'paid'
  on conflict (order_item_id)
    do nothing;

  get diagnostics inserted_count =
    row_count;

  return inserted_count;
end;
$$;

revoke all
  on function public.create_producer_earnings_for_order(uuid)
  from public;

revoke all
  on function public.create_producer_earnings_for_order(uuid)
  from anon;

revoke all
  on function public.create_producer_earnings_for_order(uuid)
  from authenticated;

grant execute
  on function public.create_producer_earnings_for_order(uuid)
  to service_role;

insert into public.producer_earnings (
  order_id,
  order_item_id,
  producer_id,
  beat_id,
  gross_amount,
  platform_fee_amount,
  producer_earning_amount,
  commission_rate,
  currency,
  status,
  available_at,
  created_at,
  updated_at
)
select
  orders.id,
  order_items.id,
  order_items.producer_id,
  order_items.beat_id,
  order_items.gross_amount,
  order_items.platform_fee_amount,
  order_items.producer_earning_amount,
  order_items.commission_rate,
  order_items.currency,

  case
    when
      coalesce(
        orders.paid_at,
        orders.updated_at,
        orders.created_at,
        now()
      ) + interval '7 days' <= now()
    then 'available'
    else 'pending'
  end,

  coalesce(
    orders.paid_at,
    orders.updated_at,
    orders.created_at,
    now()
  ) + interval '7 days',

  coalesce(
    orders.paid_at,
    orders.updated_at,
    orders.created_at,
    now()
  ),

  now()
from public.orders
inner join public.order_items
  on order_items.order_id = orders.id
where orders.status = 'paid'
on conflict (order_item_id)
  do nothing;

alter table public.producer_earnings
  enable row level security;

revoke all
  on table public.producer_earnings
  from anon;

revoke all
  on table public.producer_earnings
  from authenticated;

grant select
  on table public.producer_earnings
  to authenticated;

grant all
  on table public.producer_earnings
  to service_role;

create policy
  "Producers can view their own earnings"
on public.producer_earnings
for select
to authenticated
using (
  producer_id = auth.uid()
);

commit;