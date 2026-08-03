import { createHash } from 'crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import ProfileBeatGrid from '@/components/ProfileBeatGrid';
import { createClient } from '@/lib/supabase-server';

const USERNAME_PATTERN =
  /^[a-z0-9][a-z0-9_-]{2,29}$/;

function getDisplayName(profile) {
  return (
    profile.display_name ||
    profile.username ||
    'BeatMarket User'
  );
}

function getAvatarSource(profile) {
  if (!profile.avatar_url) {
    return '';
  }

  if (
    profile.avatar_url.startsWith(
      'https://'
    )
  ) {
    return profile.avatar_url;
  }

  const version =
    createHash('sha256')
      .update(profile.avatar_url)
      .digest('hex')
      .slice(0, 16);

  return (
    `/api/profile/avatar/${profile.id}` +
    `?v=${version}`
  );
}

function getProfileLinks(profile) {
  return [
    {
      label: 'Website',
      url: profile.website_url,
    },
    {
      label: 'Spotify',
      url: profile.spotify_url,
    },
    {
      label: 'Instagram',
      url: profile.instagram_url,
    },
    {
      label: 'YouTube',
      url: profile.youtube_url,
    },
    {
      label: 'SoundCloud',
      url: profile.soundcloud_url,
    },
    {
      label: 'TikTok',
      url: profile.tiktok_url,
    },
  ].filter((link) =>
    Boolean(link.url)
  );
}

export async function generateMetadata({
  params,
}) {
  const resolvedParams =
    await params;

  const username = String(
    resolvedParams?.username || ''
  )
    .trim()
    .toLowerCase();

  if (
    !USERNAME_PATTERN.test(username)
  ) {
    return {
      title: 'Profile Not Found',
    };
  }

  const supabase =
    await createClient();

  const {
    data: profile,
    error,
  } = await supabase
    .from('profiles')
    .select(`
      username,
      display_name,
      bio
    `)
    .eq('username', username)
    .maybeSingle();

  if (error || !profile) {
    return {
      title: 'Profile Not Found',
    };
  }

  const displayName =
    getDisplayName(profile);

  return {
    title: displayName,
    description:
      profile.bio ||
      `View ${displayName}'s public BeatMarket profile and published beats.`,
  };
}

export default async function PublicProfilePage({
  params,
}) {
  const resolvedParams =
    await params;

  const username = String(
    resolvedParams?.username || ''
  )
    .trim()
    .toLowerCase();

  if (
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const supabase =
    await createClient();

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(`
      id,
      username,
      display_name,
      avatar_url,
      bio,
      is_producer,
      website_url,
      spotify_url,
      instagram_url,
      youtube_url,
      soundcloud_url,
      tiktok_url
    `)
    .eq('username', username)
    .maybeSingle();

  if (profileError) {
    console.error(
      'Public profile loading error:',
      profileError
    );

    notFound();
  }

  if (!profile) {
    notFound();
  }

  let beats = [];
  let beatsErrorMessage = '';

  if (profile.is_producer) {
    const {
      data: beatsData,
      error: beatsError,
    } = await supabase
      .from('beats')
      .select(`
        id,
        title,
        bpm,
        is_sold_exclusive,
        created_at,
        licenses (
          id,
          name,
          price
        )
      `)
      .eq(
        'producer_id',
        profile.id
      )
      .order('created_at', {
        ascending: false,
      });

    if (beatsError) {
      console.error(
        'Public profile beats loading error:',
        beatsError
      );

      beatsErrorMessage =
        'Published beats could not be loaded.';
    } else {
      beats = beatsData ?? [];
    }
  }

  const displayName =
    getDisplayName(profile);

  const avatarSource =
    getAvatarSource(profile);

  const profileLinks =
    getProfileLinks(profile);

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'sans-serif',
      }}
    >
      <section
        style={{
          marginBottom: '36px',
          padding: '32px',
          border:
            '1px solid #e5e7eb',
          borderRadius: '16px',
          background: '#fff',
          boxShadow:
            '0 6px 20px rgba(16, 24, 40, 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: '24px',
          }}
        >
          {avatarSource ? (
            <img
              src={avatarSource}
              alt={`${displayName} profile picture`}
              width={120}
              height={120}
              style={{
                width: '120px',
                height: '120px',
                flexShrink: 0,
                border:
                  '1px solid #e5e7eb',
                borderRadius: '50%',
                background: '#f2f4f7',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: '120px',
                height: '120px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                borderRadius: '50%',
                background: '#111827',
                color: '#fff',
                fontSize: '44px',
                fontWeight: 'bold',
              }}
            >
              {displayName
                .charAt(0)
                .toUpperCase()}
            </div>
          )}

          <div
            style={{
              minWidth: 0,
              flex: '1 1 420px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '6px',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  color: '#101828',
                  fontSize: '2rem',
                }}
              >
                {displayName}
              </h1>

              <span
                style={{
                  display:
                    'inline-block',
                  padding: '5px 9px',
                  borderRadius:
                    '999px',
                  background:
                    profile.is_producer
                      ? '#ecfdf3'
                      : '#f2f4f7',
                  color:
                    profile.is_producer
                      ? '#067647'
                      : '#475467',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {profile.is_producer
                  ? 'Producer'
                  : 'Member'}
              </span>
            </div>

            <p
              style={{
                margin:
                  '0 0 18px 0',
                color: '#667085',
                fontSize: '15px',
              }}
            >
              @{profile.username}
            </p>

            {profile.bio ? (
              <p
                style={{
                  maxWidth: '720px',
                  margin:
                    '0 0 22px 0',
                  color: '#344054',
                  lineHeight: 1.7,
                  whiteSpace:
                    'pre-wrap',
                  overflowWrap:
                    'anywhere',
                }}
              >
                {profile.bio}
              </p>
            ) : (
              <p
                style={{
                  margin:
                    '0 0 22px 0',
                  color: '#98a2b3',
                  fontStyle: 'italic',
                }}
              >
                This member has not
                added a biography yet.
              </p>
            )}

            {profileLinks.length >
              0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                {profileLinks.map(
                  (link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display:
                          'inline-block',
                        padding:
                          '8px 12px',
                        border:
                          '1px solid #d0d5dd',
                        borderRadius:
                          '8px',
                        background:
                          '#fff',
                        color:
                          '#344054',
                        textDecoration:
                          'none',
                        fontSize:
                          '13px',
                        fontWeight:
                          'bold',
                      }}
                    >
                      {link.label}
                    </a>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {profile.is_producer ? (
        <section>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent:
                'space-between',
              alignItems: 'flex-end',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    '0 0 6px 0',
                  color: '#101828',
                  fontSize: '1.6rem',
                }}
              >
                Published Beats
              </h2>

              <p
                style={{
                  margin: 0,
                  color: '#667085',
                  lineHeight: 1.5,
                }}
              >
                Preview and license
                beats from{' '}
                {displayName}.
              </p>
            </div>

            <Link
              href="/explore"
              style={{
                color: '#175cd3',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Explore All Beats →
            </Link>
          </div>

          {beatsErrorMessage ? (
            <div
              style={{
                padding: '18px',
                border:
                  '1px solid #fecdca',
                borderRadius: '10px',
                background: '#fef3f2',
                color: '#b42318',
              }}
            >
              {beatsErrorMessage}
            </div>
          ) : (
            <ProfileBeatGrid
              beats={beats}
              producerName={
                displayName
              }
            />
          )}
        </section>
      ) : (
        <section
          style={{
            padding: '32px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
            color: '#667085',
            textAlign: 'center',
          }}
        >
          This member is not currently
          publishing beats.
        </section>
      )}
    </div>
  );
}