'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

const USERNAME_PATTERN =
  /^[a-z0-9][a-z0-9_-]{2,29}$/;

const SOCIAL_HOSTS = {
  spotify_url: [
    'spotify.com',
    'open.spotify.com',
  ],
  instagram_url: [
    'instagram.com',
    'www.instagram.com',
  ],
  youtube_url: [
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
  ],
  soundcloud_url: [
    'soundcloud.com',
    'www.soundcloud.com',
  ],
  tiktok_url: [
    'tiktok.com',
    'www.tiktok.com',
  ],
};

function getTextValue(formData, name) {
  return String(
    formData.get(name) || ''
  ).trim();
}

function normalizeDisplayName(value) {
  return value.replace(/\s+/g, ' ');
}

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .trim();
}

function normalizeOptionalText(value) {
  const normalized = value.trim();

  return normalized || null;
}

function normalizeUrl(value) {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  try {
    const parsedUrl =
      new URL(normalized);

    if (
      parsedUrl.protocol !== 'https:'
    ) {
      return null;
    }

    parsedUrl.hash = '';

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function hostnameMatchesAllowedHost(
  hostname,
  allowedHost
) {
  return (
    hostname === allowedHost ||
    hostname.endsWith(
      `.${allowedHost}`
    )
  );
}

function validateSocialUrl(
  value,
  fieldName
) {
  if (!value) {
    return true;
  }

  try {
    const parsedUrl =
      new URL(value);

    const allowedHosts =
      SOCIAL_HOSTS[fieldName] ?? [];

    return allowedHosts.some(
      (allowedHost) =>
        hostnameMatchesAllowedHost(
          parsedUrl.hostname.toLowerCase(),
          allowedHost
        )
    );
  } catch {
    return false;
  }
}

function redirectWithError(message) {
  redirect(
    `/profile?error=${encodeURIComponent(
      message
    )}`
  );
}

export async function saveProfile(
  formData
) {
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

  const username =
    normalizeUsername(
      getTextValue(
        formData,
        'username'
      )
    );

  const displayName =
    normalizeDisplayName(
      getTextValue(
        formData,
        'display_name'
      )
    );

  const bio =
    normalizeOptionalText(
      getTextValue(
        formData,
        'bio'
      )
    );

  const websiteUrlInput =
    getTextValue(
      formData,
      'website_url'
    );

  const spotifyUrlInput =
    getTextValue(
      formData,
      'spotify_url'
    );

  const instagramUrlInput =
    getTextValue(
      formData,
      'instagram_url'
    );

  const youtubeUrlInput =
    getTextValue(
      formData,
      'youtube_url'
    );

  const soundcloudUrlInput =
    getTextValue(
      formData,
      'soundcloud_url'
    );

  const tiktokUrlInput =
    getTextValue(
      formData,
      'tiktok_url'
    );

  if (
    !USERNAME_PATTERN.test(
      username
    )
  ) {
    redirectWithError(
      'Username must contain 3 to 30 lowercase letters, numbers, underscores, or hyphens, and must begin with a letter or number.'
    );
  }

  if (
    displayName.length < 2 ||
    displayName.length > 60
  ) {
    redirectWithError(
      'Display name must contain between 2 and 60 characters.'
    );
  }

  if (
    bio &&
    bio.length > 500
  ) {
    redirectWithError(
      'Biography cannot exceed 500 characters.'
    );
  }

  const websiteUrl =
    normalizeUrl(
      websiteUrlInput
    );

  const spotifyUrl =
    normalizeUrl(
      spotifyUrlInput
    );

  const instagramUrl =
    normalizeUrl(
      instagramUrlInput
    );

  const youtubeUrl =
    normalizeUrl(
      youtubeUrlInput
    );

  const soundcloudUrl =
    normalizeUrl(
      soundcloudUrlInput
    );

  const tiktokUrl =
    normalizeUrl(
      tiktokUrlInput
    );

  const submittedUrls = [
    [
      'Website',
      websiteUrlInput,
      websiteUrl,
    ],
    [
      'Spotify',
      spotifyUrlInput,
      spotifyUrl,
    ],
    [
      'Instagram',
      instagramUrlInput,
      instagramUrl,
    ],
    [
      'YouTube',
      youtubeUrlInput,
      youtubeUrl,
    ],
    [
      'SoundCloud',
      soundcloudUrlInput,
      soundcloudUrl,
    ],
    [
      'TikTok',
      tiktokUrlInput,
      tiktokUrl,
    ],
  ];

  const invalidUrl =
    submittedUrls.find(
      ([
        ,
        submittedValue,
        normalizedValue,
      ]) =>
        submittedValue &&
        !normalizedValue
    );

  if (invalidUrl) {
    redirectWithError(
      `${invalidUrl[0]} must be a valid HTTPS URL.`
    );
  }

  const socialUrls = [
    [
      'Spotify',
      'spotify_url',
      spotifyUrl,
    ],
    [
      'Instagram',
      'instagram_url',
      instagramUrl,
    ],
    [
      'YouTube',
      'youtube_url',
      youtubeUrl,
    ],
    [
      'SoundCloud',
      'soundcloud_url',
      soundcloudUrl,
    ],
    [
      'TikTok',
      'tiktok_url',
      tiktokUrl,
    ],
  ];

  const invalidSocialUrl =
    socialUrls.find(
      ([
        ,
        fieldName,
        value,
      ]) =>
        !validateSocialUrl(
          value,
          fieldName
        )
    );

  if (invalidSocialUrl) {
    redirectWithError(
      `${invalidSocialUrl[0]} URL must use the official ${invalidSocialUrl[0]} domain.`
    );
  }

  const {
    data: currentProfile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !currentProfile
  ) {
    console.error(
      'Profile loading error:',
      profileError
    );

    redirectWithError(
      'Your profile could not be loaded. Please try again.'
    );
  }

  const {
    error: updateError,
  } = await supabase
    .from('profiles')
    .update({
      username,
      display_name: displayName,
      bio,
      website_url: websiteUrl,
      spotify_url: spotifyUrl,
      instagram_url: instagramUrl,
      youtube_url: youtubeUrl,
      soundcloud_url: soundcloudUrl,
      tiktok_url: tiktokUrl,
    })
    .eq('id', user.id);

  if (updateError) {
    console.error(
      'Profile update error:',
      updateError
    );

    if (
      updateError.code === '23505' ||
      updateError.message
        ?.toLowerCase()
        .includes('username')
    ) {
      redirectWithError(
        'That username is already taken. Please choose another one.'
      );
    }

    redirectWithError(
      'Your profile could not be saved. Please try again.'
    );
  }

  revalidatePath('/profile');
  revalidatePath('/explore');
  revalidatePath('/dashboard');

  if (currentProfile.username) {
    revalidatePath(
      `/profile/${currentProfile.username}`
    );
  }

  revalidatePath(
    `/profile/${username}`
  );

  redirect(
    `/profile?success=${encodeURIComponent(
      'Your profile has been saved.'
    )}`
  );
}