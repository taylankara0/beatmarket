create table if not exists public.free_beat_downloads (
  id uuid
    primary key
    default gen_random_uuid(),

  beat_id uuid
    not null
    references public.beats(id)
    on delete cascade,

  downloader_id uuid
    not null
    references public.profiles(id)
    on delete cascade,

  license_version text
    not null,

  accepted_at timestamptz
    not null
    default now(),

  downloaded_at timestamptz
    not null
    default now(),

  constraint free_beat_downloads_license_version_check
    check (
      license_version = btrim(license_version)
      and char_length(license_version)
        between 1 and 64
    )
);

comment on table public.free_beat_downloads is
  'Records authenticated free-beat downloads and the license version accepted for each successful download.';

comment on column public.free_beat_downloads.license_version is
  'Version identifier of the free-beat license accepted by the downloader.';

create index if not exists
  free_beat_downloads_downloader_downloaded_at_idx
on public.free_beat_downloads (
  downloader_id,
  downloaded_at desc
);

create index if not exists
  free_beat_downloads_beat_downloaded_at_idx
on public.free_beat_downloads (
  beat_id,
  downloaded_at desc
);

alter table public.free_beat_downloads
enable row level security;

revoke all
on table public.free_beat_downloads
from anon, authenticated;

grant select
on table public.free_beat_downloads
to authenticated;

drop policy if exists
  "Users can view their own free beat downloads"
on public.free_beat_downloads;

create policy
  "Users can view their own free beat downloads"
on public.free_beat_downloads
for select
to authenticated
using (
  downloader_id = auth.uid()
);