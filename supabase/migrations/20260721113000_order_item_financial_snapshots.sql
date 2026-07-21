begin;

alter table public.order_items
  add column gross_amount numeric(12, 2),
  add column platform_fee_amount numeric(12, 2),
  add column producer_earning_amount numeric(12, 2),
  add column commission_rate numeric(5, 2),
  add column currency text;

with financial_source as (
  select
    order_items.id,
    round(
      coalesce(
        order_items.iyzico_paid_price,
        order_items.price
      )::numeric,
      2
    ) as gross_amount,
    upper(
      coalesce(
        nullif(trim(orders.currency), ''),
        'TRY'
      )
    ) as currency
  from public.order_items
  inner join public.orders
    on orders.id = order_items.order_id
)
update public.order_items
set
  gross_amount =
    financial_source.gross_amount,

  commission_rate =
    10.00,

  platform_fee_amount =
    round(
      financial_source.gross_amount *
      0.10,
      2
    ),

  producer_earning_amount =
    financial_source.gross_amount -
    round(
      financial_source.gross_amount *
      0.10,
      2
    ),

  currency =
    financial_source.currency
from financial_source
where
  order_items.id =
  financial_source.id;

alter table public.order_items
  alter column gross_amount
    set not null,

  alter column platform_fee_amount
    set not null,

  alter column producer_earning_amount
    set not null,

  alter column commission_rate
    set not null,

  alter column currency
    set not null;

alter table public.order_items
  add constraint order_items_gross_amount_nonnegative
    check (
      gross_amount >= 0
    ),

  add constraint order_items_platform_fee_nonnegative
    check (
      platform_fee_amount >= 0
    ),

  add constraint order_items_producer_earning_nonnegative
    check (
      producer_earning_amount >= 0
    ),

  add constraint order_items_commission_rate_range
    check (
      commission_rate >= 0
      and commission_rate <= 100
    ),

  add constraint order_items_financial_split_matches
    check (
      gross_amount =
      platform_fee_amount +
      producer_earning_amount
    ),

  add constraint order_items_currency_format
    check (
      char_length(currency) = 3
      and currency = upper(currency)
    );

comment on column public.order_items.gross_amount is
  'Immutable gross sale amount recorded for this purchased item.';

comment on column public.order_items.platform_fee_amount is
  'Immutable platform commission amount recorded at purchase time.';

comment on column public.order_items.producer_earning_amount is
  'Immutable producer earning before refunds and payouts.';

comment on column public.order_items.commission_rate is
  'Platform commission percentage applied when the purchase was created.';

comment on column public.order_items.currency is
  'Three-letter uppercase currency code captured at purchase time.';

commit;