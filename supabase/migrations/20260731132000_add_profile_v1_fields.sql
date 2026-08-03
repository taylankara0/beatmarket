alter table public.profiles
  add column bio text,
  add column website_url text,
  add column spotify_url text,
  add column instagram_url text,
  add column youtube_url text,
  add column soundcloud_url text,
  add column tiktok_url text;

alter table public.profiles
  drop constraint profiles_username_key;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or (
      username = lower(btrim(username))
      and username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    )
  );

alter table public.profiles
  add constraint profiles_bio_length_check
  check (
    bio is null
    or char_length(bio) <= 500
  );

alter table public.profiles
  add constraint profiles_website_url_check
  check (
    website_url is null
    or (
      char_length(website_url) <= 500
      and website_url ~ '^https://'
    )
  );

alter table public.profiles
  add constraint profiles_spotify_url_check
  check (
    spotify_url is null
    or (
      char_length(spotify_url) <= 500
      and spotify_url ~ '^https://'
    )
  );

alter table public.profiles
  add constraint profiles_instagram_url_check
  check (
    instagram_url is null
    or (
      char_length(instagram_url) <= 500
      and instagram_url ~ '^https://'
    )
  );

alter table public.profiles
  add constraint profiles_youtube_url_check
  check (
    youtube_url is null
    or (
      char_length(youtube_url) <= 500
      and youtube_url ~ '^https://'
    )
  );

alter table public.profiles
  add constraint profiles_soundcloud_url_check
  check (
    soundcloud_url is null
    or (
      char_length(soundcloud_url) <= 500
      and soundcloud_url ~ '^https://'
    )
  );

alter table public.profiles
  add constraint profiles_tiktok_url_check
  check (
    tiktok_url is null
    or (
      char_length(tiktok_url) <= 500
      and tiktok_url ~ '^https://'
    )
  );

create unique index profiles_username_normalized_key
  on public.profiles (lower(username))
  where username is not null;

grant select (
  bio,
  website_url,
  spotify_url,
  instagram_url,
  youtube_url,
  soundcloud_url,
  tiktok_url
)
on public.profiles
to anon, authenticated;

grant update (
  bio,
  website_url,
  spotify_url,
  instagram_url,
  youtube_url,
  soundcloud_url,
  tiktok_url
)
on public.profiles
to authenticated;

comment on column public.profiles.bio is
  'Public profile biography with a maximum length of 500 characters.';

comment on column public.profiles.website_url is
  'Public HTTPS website URL.';

comment on column public.profiles.spotify_url is
  'Public HTTPS Spotify profile or artist URL.';

comment on column public.profiles.instagram_url is
  'Public HTTPS Instagram profile URL.';

comment on column public.profiles.youtube_url is
  'Public HTTPS YouTube channel or profile URL.';

comment on column public.profiles.soundcloud_url is
  'Public HTTPS SoundCloud profile URL.';

comment on column public.profiles.tiktok_url is
  'Public HTTPS TikTok profile URL.';