create table if not exists public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),

  job_name text not null,

  request_id text not null,

  status text not null,

  started_at timestamptz not null,

  completed_at timestamptz not null,

  duration_ms bigint not null,

  summary jsonb not null default '{}'::jsonb,

  error_message text null,

  created_at timestamptz not null default now(),

  constraint scheduled_job_runs_job_name_valid
    check (
      char_length(job_name) between 1 and 100
      and job_name ~ '^[a-z0-9_]+$'
    ),

  constraint scheduled_job_runs_request_id_valid
    check (
      char_length(request_id) between 1 and 200
    ),

  constraint scheduled_job_runs_status_valid
    check (
      status in (
        'succeeded',
        'partial_failure',
        'failed'
      )
    ),

  constraint scheduled_job_runs_duration_valid
    check (
      duration_ms >= 0
    ),

  constraint scheduled_job_runs_time_order_valid
    check (
      completed_at >= started_at
    ),

  constraint scheduled_job_runs_failure_message_valid
    check (
      status <> 'failed'
      or error_message is not null
    )
);

create index if not exists
  scheduled_job_runs_job_completed_idx
on public.scheduled_job_runs (
  job_name,
  completed_at desc
);

create index if not exists
  scheduled_job_runs_status_completed_idx
on public.scheduled_job_runs (
  status,
  completed_at desc
);

alter table public.scheduled_job_runs
  enable row level security;

revoke all
on table public.scheduled_job_runs
from public;

revoke all
on table public.scheduled_job_runs
from anon;

revoke all
on table public.scheduled_job_runs
from authenticated;

grant select
on table public.scheduled_job_runs
to authenticated;

drop policy if exists
  "Platform admins can view scheduled job runs"
on public.scheduled_job_runs;

create policy
  "Platform admins can view scheduled job runs"
on public.scheduled_job_runs
for select
to authenticated
using (
  public.is_platform_admin()
);