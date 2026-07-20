begin;

alter table public.profiles
add column if not exists is_producer boolean not null default false;

revoke insert, delete, update
on table public.profiles
from public, anon, authenticated;

grant update (
  avatar_url,
  display_name,
  full_name,
  username
)
on table public.profiles
to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (
    id,
    is_producer,
    updated_at
  )
  values (
    new.id,
    false,
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

revoke execute
on function public.handle_new_user()
from public, anon, authenticated;

create or replace function public.activate_producer_profile()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.profiles
  set
    is_producer = true,
    updated_at = now()
  where id = current_user_id
    and is_producer = false;

  if found then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles
    where id = current_user_id
      and is_producer = true
  ) then
    return true;
  end if;

  raise exception 'The authenticated profile could not be found.';
end;
$function$;

revoke execute
on function public.activate_producer_profile()
from public, anon;

grant execute
on function public.activate_producer_profile()
to authenticated;

commit;