begin;

create table if not exists public.api_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),

  constraint api_rate_limits_rate_key_not_blank
    check (btrim(rate_key) <> ''),

  constraint api_rate_limits_request_count_positive
    check (request_count > 0)
);

alter table public.api_rate_limits
  enable row level security;

revoke all
  on table public.api_rate_limits
  from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  target_rate_key text,
  target_max_requests integer,
  target_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_time_value timestamptz :=
    clock_timestamp();

  window_interval_value interval;

  normalized_rate_key text :=
    btrim(target_rate_key);

  rate_limit_row public.api_rate_limits%rowtype;
begin
  if
    normalized_rate_key is null or
    normalized_rate_key = ''
  then
    raise exception
      'The rate-limit key cannot be empty.';
  end if;

  if char_length(normalized_rate_key) > 200 then
    raise exception
      'The rate-limit key is too long.';
  end if;

  if
    target_max_requests is null or
    target_max_requests < 1 or
    target_max_requests > 10000
  then
    raise exception
      'The maximum request count is invalid.';
  end if;

  if
    target_window_seconds is null or
    target_window_seconds < 1 or
    target_window_seconds > 86400
  then
    raise exception
      'The rate-limit window is invalid.';
  end if;

  window_interval_value :=
    make_interval(
      secs => target_window_seconds
    );

  insert into public.api_rate_limits as existing_limit (
    rate_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    normalized_rate_key,
    current_time_value,
    1,
    current_time_value
  )
  on conflict (rate_key)
  do update
  set
    window_started_at =
      case
        when
          existing_limit.window_started_at +
            window_interval_value <=
          current_time_value
        then current_time_value
        else existing_limit.window_started_at
      end,

    request_count =
      case
        when
          existing_limit.window_started_at +
            window_interval_value <=
          current_time_value
        then 1
        else existing_limit.request_count + 1
      end,

    updated_at = current_time_value
  returning
    existing_limit.*
  into rate_limit_row;

  allowed :=
    rate_limit_row.request_count <=
    target_max_requests;

  remaining :=
    greatest(
      target_max_requests -
        rate_limit_row.request_count,
      0
    );

  retry_after_seconds :=
    case
      when allowed then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              rate_limit_row.window_started_at +
                window_interval_value -
                current_time_value
            )
          )
        )::integer
      )
    end;

  return next;
end;
$function$;

revoke all
  on function public.consume_api_rate_limit(
    text,
    integer,
    integer
  )
  from public, anon, authenticated;

grant execute
  on function public.consume_api_rate_limit(
    text,
    integer,
    integer
  )
  to service_role;

comment on table public.api_rate_limits is
  'Server-managed fixed-window API request counters.';

comment on function public.consume_api_rate_limit(
  text,
  integer,
  integer
) is
  'Atomically consumes one request from a server-managed API rate limit.';

commit;