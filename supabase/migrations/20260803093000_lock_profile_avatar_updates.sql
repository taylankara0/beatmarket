revoke update (avatar_url)
on public.profiles
from authenticated;

comment on column public.profiles.avatar_url is
  'Private R2 avatar object key. Updated only through the trusted server-side avatar completion flow.';