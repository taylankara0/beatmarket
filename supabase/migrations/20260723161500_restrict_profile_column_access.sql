revoke select
on table public.profiles
from public, anon, authenticated;

grant select (
  id,
  username,
  display_name,
  avatar_url
)
on table public.profiles
to anon;

grant select (
  id,
  updated_at,
  username,
  avatar_url,
  is_producer,
  display_name
)
on table public.profiles
to authenticated;