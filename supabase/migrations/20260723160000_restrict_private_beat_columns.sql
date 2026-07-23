revoke select
on table public.beats
from public, anon, authenticated;

grant select (
  id,
  producer_id,
  title,
  description,
  genre,
  bpm,
  scale,
  tags,
  preview_url,
  is_sold_exclusive,
  created_at,
  updated_at
)
on table public.beats
to anon, authenticated;