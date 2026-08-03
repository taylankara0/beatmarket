alter table public.beats
add column if not exists is_free_download_enabled boolean
not null
default false;

alter table public.beats
drop constraint if exists beats_free_download_not_sold_exclusive_check;

alter table public.beats
add constraint beats_free_download_not_sold_exclusive_check
check (
  not is_free_download_enabled
  or coalesce(is_sold_exclusive, false) = false
);

comment on column public.beats.is_free_download_enabled is
  'Controls whether the producer allows the private master track to be downloaded through the trusted free-download flow.';

grant select (is_free_download_enabled)
on public.beats
to anon, authenticated;