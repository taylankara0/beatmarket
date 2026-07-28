begin;

create table if not exists
  public.payout_status_email_deliveries (
    id uuid primary key
      default gen_random_uuid(),

    payout_request_id uuid not null
      references public.payout_requests(id)
      on delete restrict,

    event_type text not null,

    status text not null,

    sent_at timestamptz,

    provider_message_id text,

    error_message text,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    constraint
      payout_status_email_deliveries_request_event_unique
      unique (
        payout_request_id,
        event_type
      ),

    constraint
      payout_status_email_deliveries_event_type_valid
      check (
        event_type in (
          'approved',
          'rejected',
          'paid'
        )
      ),

    constraint
      payout_status_email_deliveries_status_valid
      check (
        status in (
          'sending',
          'sent',
          'failed'
        )
      ),

    constraint
      payout_status_email_deliveries_sent_timestamp_valid
      check (
        sent_at is null
        or status = 'sent'
      )
  );

create index if not exists
  payout_status_email_deliveries_request_idx
on public.payout_status_email_deliveries (
  payout_request_id,
  created_at desc
);

create index if not exists
  payout_status_email_deliveries_status_idx
on public.payout_status_email_deliveries (
  status,
  created_at desc
);

alter table
  public.payout_status_email_deliveries
enable row level security;

revoke all
on table
  public.payout_status_email_deliveries
from public;

revoke all
on table
  public.payout_status_email_deliveries
from anon;

revoke all
on table
  public.payout_status_email_deliveries
from authenticated;

grant select
on table
  public.payout_status_email_deliveries
to authenticated;

drop policy if exists
  "Producers can view their payout status email deliveries"
on public.payout_status_email_deliveries;

create policy
  "Producers can view their payout status email deliveries"
on public.payout_status_email_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.payout_requests
    where payout_requests.id =
      payout_status_email_deliveries.payout_request_id
      and payout_requests.producer_id =
        auth.uid()
  )
);

drop policy if exists
  "Platform admins can view payout status email deliveries"
on public.payout_status_email_deliveries;

create policy
  "Platform admins can view payout status email deliveries"
on public.payout_status_email_deliveries
for select
to authenticated
using (
  public.is_platform_admin()
);

comment on table
  public.payout_status_email_deliveries
is
  'Tracks approved, rejected, and paid payout-status emails sent to producers.';

comment on column
  public.payout_status_email_deliveries.event_type
is
  'Payout event represented by the email: approved, rejected, or paid.';

comment on column
  public.payout_status_email_deliveries.status
is
  'Current delivery state: sending, sent, or failed.';

comment on column
  public.payout_status_email_deliveries.sent_at
is
  'Timestamp when the email provider accepted the payout-status email.';

comment on column
  public.payout_status_email_deliveries.provider_message_id
is
  'Email provider message identifier for the payout-status email.';

comment on column
  public.payout_status_email_deliveries.error_message
is
  'Most recent payout-status email delivery error.';

commit;