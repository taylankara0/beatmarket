begin;

create table if not exists
  public.producer_refund_email_deliveries (
    id uuid primary key
      default gen_random_uuid(),

    order_refund_id uuid not null
      references public.order_refunds(id)
      on delete restrict,

    producer_id uuid not null
      references public.profiles(id)
      on delete restrict,

    status text not null,

    sent_at timestamptz,

    provider_message_id text,

    error_message text,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    constraint
      producer_refund_email_deliveries_refund_producer_unique
      unique (
        order_refund_id,
        producer_id
      ),

    constraint
      producer_refund_email_deliveries_status_valid
      check (
        status in (
          'sending',
          'sent',
          'failed'
        )
      ),

    constraint
      producer_refund_email_deliveries_sent_timestamp_valid
      check (
        sent_at is null
        or status = 'sent'
      )
  );

create index if not exists
  producer_refund_email_deliveries_producer_status_idx
on public.producer_refund_email_deliveries (
  producer_id,
  status,
  created_at desc
);

create index if not exists
  producer_refund_email_deliveries_refund_idx
on public.producer_refund_email_deliveries (
  order_refund_id
);

alter table
  public.producer_refund_email_deliveries
enable row level security;

revoke all
on table
  public.producer_refund_email_deliveries
from public;

revoke all
on table
  public.producer_refund_email_deliveries
from anon;

revoke all
on table
  public.producer_refund_email_deliveries
from authenticated;

grant select
on table
  public.producer_refund_email_deliveries
to authenticated;

drop policy if exists
  "Producers can view their own refund email deliveries"
on public.producer_refund_email_deliveries;

create policy
  "Producers can view their own refund email deliveries"
on public.producer_refund_email_deliveries
for select
to authenticated
using (
  producer_id = auth.uid()
);

drop policy if exists
  "Platform admins can view producer refund email deliveries"
on public.producer_refund_email_deliveries;

create policy
  "Platform admins can view producer refund email deliveries"
on public.producer_refund_email_deliveries
for select
to authenticated
using (
  public.is_platform_admin()
);

comment on table
  public.producer_refund_email_deliveries
is
  'Tracks one producer refund notification email per producer and completed order refund.';

comment on column
  public.producer_refund_email_deliveries.status
is
  'Current delivery state: sending, sent, or failed.';

comment on column
  public.producer_refund_email_deliveries.sent_at
is
  'Timestamp when the email provider accepted the producer refund notification.';

comment on column
  public.producer_refund_email_deliveries.provider_message_id
is
  'Email provider message identifier for the producer refund notification.';

comment on column
  public.producer_refund_email_deliveries.error_message
is
  'Most recent producer refund notification delivery error.';

commit;