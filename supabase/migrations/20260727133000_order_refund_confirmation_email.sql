begin;

alter table public.order_refunds
  add column if not exists refund_confirmation_email_status text,
  add column if not exists refund_confirmation_email_sent_at timestamptz,
  add column if not exists refund_confirmation_email_provider_id text,
  add column if not exists refund_confirmation_email_error text,
  add column if not exists refund_confirmation_email_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'order_refunds_confirmation_email_status_valid'
      and conrelid =
        'public.order_refunds'::regclass
  ) then
    alter table public.order_refunds
      add constraint
        order_refunds_confirmation_email_status_valid
      check (
        refund_confirmation_email_status is null
        or refund_confirmation_email_status in (
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
      'order_refunds_confirmation_email_sent_timestamp_valid'
      and conrelid =
        'public.order_refunds'::regclass
  ) then
    alter table public.order_refunds
      add constraint
        order_refunds_confirmation_email_sent_timestamp_valid
      check (
        refund_confirmation_email_sent_at is null
        or refund_confirmation_email_status = 'sent'
      );
  end if;
end
$$;

update public.order_refunds
set
  refund_confirmation_email_status =
    'skipped_legacy',
  refund_confirmation_email_updated_at =
    coalesce(
      updated_at,
      created_at,
      now()
    )
where status = 'refunded'
  and refund_confirmation_email_status is null;

comment on column
  public.order_refunds.refund_confirmation_email_status
is
  'Delivery state for the buyer refund confirmation email.';

comment on column
  public.order_refunds.refund_confirmation_email_sent_at
is
  'Timestamp when the refund confirmation email was accepted by the email provider.';

comment on column
  public.order_refunds.refund_confirmation_email_provider_id
is
  'Email provider message identifier for the refund confirmation email.';

comment on column
  public.order_refunds.refund_confirmation_email_error
is
  'Most recent refund confirmation email delivery error.';

comment on column
  public.order_refunds.refund_confirmation_email_updated_at
is
  'Timestamp of the most recent refund confirmation email state change.';

commit;