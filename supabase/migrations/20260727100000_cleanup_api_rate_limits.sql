create or replace function public.cleanup_expired_api_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.api_rate_limits
  where updated_at <
    now() - interval '48 hours';

  get diagnostics deleted_count =
    row_count;

  return deleted_count;
end;
$$;

revoke all
on function public.cleanup_expired_api_rate_limits()
from public;

revoke all
on function public.cleanup_expired_api_rate_limits()
from anon;

revoke all
on function public.cleanup_expired_api_rate_limits()
from authenticated;

grant execute
on function public.cleanup_expired_api_rate_limits()
to service_role;