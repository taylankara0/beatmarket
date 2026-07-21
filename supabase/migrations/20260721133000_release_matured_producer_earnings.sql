begin;

create or replace function public.release_matured_producer_earnings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released_count integer;
begin
  update public.producer_earnings
  set
    status = 'available',
    updated_at = now()
  where status = 'pending'
    and available_at <= now();

  get diagnostics released_count =
    row_count;

  return released_count;
end;
$$;

comment on function public.release_matured_producer_earnings() is
  'Idempotently changes pending producer earnings to available after their hold period ends.';

revoke all
  on function public.release_matured_producer_earnings()
  from public;

revoke all
  on function public.release_matured_producer_earnings()
  from anon;

revoke all
  on function public.release_matured_producer_earnings()
  from authenticated;

grant execute
  on function public.release_matured_producer_earnings()
  to service_role;

commit;