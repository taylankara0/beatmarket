import Link from 'next/link';
import { redirect } from 'next/navigation';

import ProfileAvatarUploader from '@/components/ProfileAvatarUploader';
import { createClient } from '@/lib/supabase-server';

import { saveProfile } from './actions';

function getMessage(searchParams, key) {
  const value = searchParams?.[key];

  return typeof value === 'string'
    ? value
    : '';
}

function getProfileDisplayName(profile) {
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

  const updatedTime =
    new Date(
      profile.updated_at
    ).getTime();

  const version =
    Number.isFinite(updatedTime)
      ? updatedTime
      : Date.now();

  return (
    `/api/profile/avatar/${profile.id}` +
    `?v=${version}`
  );
}

export const metadata = {
  title: 'Profile',
  description:
    'Manage your public BeatMarket profile and social links.',
};

export default async function ProfilePage({
  searchParams,
}) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } =
    await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const resolvedSearchParams =
    await searchParams;

  const successMessage =
    getMessage(
      resolvedSearchParams,
      'success'
    );

  const errorMessage =
    getMessage(
      resolvedSearchParams,
      'error'
    );

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(`
      id,
      updated_at,
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
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile
  ) {
    console.error(
      'Profile page loading error:',
      profileError
    );

    return (
      <div
        style={{
          maxWidth: '900px',
          margin: '40px auto',
          padding: '0 20px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            padding: '20px',
            border:
              '1px solid #fecdca',
            borderRadius: '10px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          Your profile could not be
          loaded.
        </div>
      </div>
    );
  }

  const displayName =
    getProfileDisplayName(
      profile
    );

  const avatarSource =
    getAvatarSource(profile);

  return (
    <div
      style={{
        maxWidth: '900px',
        margin: '40px auto',
        padding: '0 20px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent:
            'space-between',
          alignItems: 'flex-start',
          gap: '20px',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom:
            '1px solid #e5e7eb',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px 0',
            }}
          >
            Your Profile
          </h1>

          <p
            style={{
              margin: 0,
              color: '#667085',
              lineHeight: 1.5,
            }}
          >
            Manage the public
            information shown on your
            BeatMarket profile.
          </p>
        </div>

        {profile.username && (
          <Link
            href={
              `/profile/${profile.username}`
            }
            style={{
              padding: '10px 16px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              background: '#fff',
              color: '#344054',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            View Public Profile
          </Link>
        )}
      </header>

      {successMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border:
              '1px solid #a6f4c5',
            borderRadius: '8px',
            background: '#ecfdf3',
            color: '#067647',
          }}
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            border:
              '1px solid #fecdca',
            borderRadius: '8px',
            background: '#fef3f2',
            color: '#b42318',
          }}
        >
          {errorMessage}
        </div>
      )}

      <section
        style={{
          marginBottom: '24px',
          padding: '24px',
          border:
            '1px solid #e5e7eb',
          borderRadius: '12px',
          background: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: '24px',
          }}
        >
          <ProfileAvatarUploader
            profileId={profile.id}
            displayName={displayName}
            initialAvatarSrc={
              avatarSource
            }
          />

          <div
            style={{
              minWidth: '220px',
              flex: '1 1 260px',
            }}
          >
            <h2
              style={{
                margin:
                  '0 0 5px 0',
                fontSize: '1.3rem',
              }}
            >
              {displayName}
            </h2>

            <p
              style={{
                margin:
                  '0 0 8px 0',
                color: '#667085',
                fontSize: '14px',
              }}
            >
              {profile.username
                ? `@${profile.username}`
                : 'Choose a username to publish your profile.'}
            </p>

            <span
              style={{
                display:
                  'inline-block',
                padding: '4px 8px',
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
        </div>
      </section>

      <form action={saveProfile}>
        <section
          style={{
            marginBottom: '24px',
            padding: '24px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: '1.35rem',
            }}
          >
            Basic Information
          </h2>

          <p
            style={{
              margin:
                '0 0 24px 0',
              color: '#667085',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            Your username becomes part
            of your public profile
            address.
          </p>

          <label
            htmlFor="username"
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#344054',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Username
          </label>

          <input
            id="username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9][a-z0-9_-]{2,29}"
            defaultValue={
              profile.username ?? ''
            }
            placeholder="your_username"
            autoComplete="username"
            spellCheck={false}
            style={{
              width: '100%',
              boxSizing:
                'border-box',
              marginBottom: '6px',
              padding: '11px 12px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />

          <p
            style={{
              margin:
                '0 0 18px 0',
              color: '#667085',
              fontSize: '12px',
              lineHeight: 1.5,
            }}
          >
            Use 3–30 lowercase letters,
            numbers, underscores, or
            hyphens.
          </p>

          <label
            htmlFor="display_name"
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#344054',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Display Name
          </label>

          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            minLength={2}
            maxLength={60}
            defaultValue={
              profile.display_name ??
              ''
            }
            placeholder="Your public name"
            autoComplete="nickname"
            style={{
              width: '100%',
              boxSizing:
                'border-box',
              marginBottom: '18px',
              padding: '11px 12px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          />

          <label
            htmlFor="bio"
            style={{
              display: 'block',
              marginBottom: '6px',
              color: '#344054',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Biography
          </label>

          <textarea
            id="bio"
            name="bio"
            maxLength={500}
            defaultValue={
              profile.bio ?? ''
            }
            placeholder="Tell listeners and artists about yourself."
            rows={6}
            style={{
              width: '100%',
              boxSizing:
                'border-box',
              marginBottom: '6px',
              padding: '11px 12px',
              border:
                '1px solid #d0d5dd',
              borderRadius: '8px',
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          />

          <p
            style={{
              margin: 0,
              color: '#667085',
              fontSize: '12px',
            }}
          >
            Maximum 500 characters.
          </p>
        </section>

        <section
          style={{
            marginBottom: '24px',
            padding: '24px',
            border:
              '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#fff',
          }}
        >
          <h2
            style={{
              margin: '0 0 8px 0',
              fontSize: '1.35rem',
            }}
          >
            Links
          </h2>

          <p
            style={{
              margin:
                '0 0 24px 0',
              color: '#667085',
              fontSize: '14px',
              lineHeight: 1.5,
            }}
          >
            All links must use HTTPS.
            Social links must use the
            platform&apos;s official
            domain.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '18px',
            }}
          >
            <ProfileUrlField
              id="website_url"
              label="Website"
              value={
                profile.website_url
              }
              placeholder="https://yourwebsite.com"
            />

            <ProfileUrlField
              id="spotify_url"
              label="Spotify"
              value={
                profile.spotify_url
              }
              placeholder="https://open.spotify.com/..."
            />

            <ProfileUrlField
              id="instagram_url"
              label="Instagram"
              value={
                profile.instagram_url
              }
              placeholder="https://instagram.com/..."
            />

            <ProfileUrlField
              id="youtube_url"
              label="YouTube"
              value={
                profile.youtube_url
              }
              placeholder="https://youtube.com/..."
            />

            <ProfileUrlField
              id="soundcloud_url"
              label="SoundCloud"
              value={
                profile.soundcloud_url
              }
              placeholder="https://soundcloud.com/..."
            />

            <ProfileUrlField
              id="tiktok_url"
              label="TikTok"
              value={
                profile.tiktok_url
              }
              placeholder="https://tiktok.com/@..."
            />
          </div>
        </section>

        <div
          style={{
            display: 'flex',
            justifyContent:
              'flex-end',
          }}
        >
          <button
            type="submit"
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '12px 22px',
              background: '#0070f3',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Save Profile
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileUrlField({
  id,
  label,
  value,
  placeholder,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          marginBottom: '6px',
          color: '#344054',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type="url"
        maxLength={500}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        autoComplete="url"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '11px 12px',
          border:
            '1px solid #d0d5dd',
          borderRadius: '8px',
          fontSize: '14px',
        }}
      />
    </div>
  );
}