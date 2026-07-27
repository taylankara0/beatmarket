begin;

alter table public.orders
  add column if not exists purchase_confirmation_email_status text,
  add column if not exists purchase_confirmation_email_sent_at timestamptz,
  add column if not exists purchase_confirmation_email_provider_id text,
  add column if not exists purchase_confirmation_email_error text,
  add column if not exists purchase_confirmation_email_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'orders_purchase_confirmation_email_status_valid'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint
        orders_purchase_confirmation_email_status_valid
      check (
        purchase_confirmation_email_status is null
        or purchase_confirmation_email_status in (
          'sending',
          'sent',
          'failed',
          'skipped_legacy'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'orders_purchase_confirmation_email_sent_timestamp_valid'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint
        orders_purchase_confirmation_email_sent_timestamp_valid
      check (
        purchase_confirmation_email_sent_at is null
        or purchase_confirmation_email_status = 'sent'
      );
  end if;
end
$$;

update public.orders
set
  purchase_confirmation_email_status =
    'skipped_legacy',
  purchase_confirmation_email_updated_at =
    coalesce(
      updated_at,
      paid_at,
      created_at,
      now()
    )
where status in ('paid', 'refunded')
  and purchase_confirmation_email_status is null;

comment on column
  public.orders.purchase_confirmation_email_status
is
  'Delivery state for the buyer purchase confirmation email.';

comment on column
  public.orders.purchase_confirmation_email_sent_at
is
  'Timestamp when the purchase confirmation email was accepted by the email provider.';

comment on column
  public.orders.purchase_confirmation_email_provider_id
is
  'Email provider message identifier for the purchase confirmation email.';

comment on column
  public.orders.purchase_confirmation_email_error
is
  'Most recent purchase confirmation email delivery error.';

comment on column
  public.orders.purchase_confirmation_email_updated_at
is
  'Timestamp of the most recent purchase confirmation email state change.';

commit;