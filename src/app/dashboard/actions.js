'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createClient as createSupabaseAdminClient,
} from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is missing.'
    );
  }

  return createSupabaseAdminClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function activateProducerProfile() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const {
    data: activated,
    error: activationError,
  } = await supabase.rpc(
    'activate_producer_profile'
  );

  if (
    activationError ||
    activated !== true
  ) {
    console.error(
      'Producer activation error:',
      activationError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Producer profile activation failed. Please try again.'
      )}`
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/upload-beat');
  revalidatePath('/profile');
  revalidatePath('/explore');

  redirect(
    `/dashboard?success=${encodeURIComponent(
      'Your producer profile has been activated.'
    )}`
  );
}

export async function saveProducerDisplayName(
  formData
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const displayName = String(
    formData.get('display_name') || ''
  )
    .trim()
    .replace(/\s+/g, ' ');

  if (
    displayName.length < 2 ||
    displayName.length > 60
  ) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Your producer display name must contain between 2 and 60 characters.'
      )}`
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(
      'is_producer, username'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile?.is_producer
  ) {
    console.error(
      'Producer display name authorization error:',
      profileError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Only an active producer can update a producer display name.'
      )}`
    );
  }

  const {
    error: updateError,
  } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
    })
    .eq('id', user.id);

  if (updateError) {
    console.error(
      'Producer display name update error:',
      updateError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Your producer display name could not be saved. Please try again.'
      )}`
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/profile');
  revalidatePath('/explore');

  if (profile.username) {
    revalidatePath(
      `/profile/${profile.username}`
    );
  }

  redirect(
    `/dashboard?success=${encodeURIComponent(
      'Your producer display name has been saved.'
    )}`
  );
}

export async function setBeatFreeDownloadAvailability(
  formData
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const beatId = String(
    formData.get('beat_id') || ''
  ).trim();

  const requestedAction = String(
    formData.get(
      'free_download_action'
    ) || ''
  )
    .trim()
    .toLowerCase();

  if (!UUID_PATTERN.test(beatId)) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'The selected beat is invalid.'
      )}`
    );
  }

  if (
    requestedAction !== 'enable' &&
    requestedAction !== 'disable'
  ) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'The requested free-download change is invalid.'
      )}`
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(
      'is_producer, username'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile?.is_producer
  ) {
    console.error(
      'Free-download producer authorization error:',
      profileError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Only an active producer can manage beat downloads.'
      )}`
    );
  }

  const supabaseAdmin =
    getSupabaseAdmin();

  const {
    data: beat,
    error: beatError,
  } = await supabaseAdmin
    .from('beats')
    .select(`
      id,
      producer_id,
      title,
      is_sold_exclusive,
      is_free_download_enabled
    `)
    .eq('id', beatId)
    .maybeSingle();

  if (
    beatError ||
    !beat
  ) {
    console.error(
      'Free-download beat loading error:',
      beatError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'The selected beat could not be found.'
      )}`
    );
  }

  if (
    beat.producer_id !== user.id
  ) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'You can only manage free downloads for your own beats.'
      )}`
    );
  }

  const shouldEnable =
    requestedAction === 'enable';

  if (
    shouldEnable &&
    beat.is_sold_exclusive === true
  ) {
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'A beat sold through an Exclusive license cannot be enabled for free download.'
      )}`
    );
  }

  if (
    beat.is_free_download_enabled ===
    shouldEnable
  ) {
    const unchangedMessage =
      shouldEnable
        ? 'Free downloads are already enabled for this beat.'
        : 'Free downloads are already disabled for this beat.';

    redirect(
      `/dashboard?success=${encodeURIComponent(
        unchangedMessage
      )}`
    );
  }

  const {
    data: updatedBeat,
    error: updateError,
  } = await supabaseAdmin
    .from('beats')
    .update({
      is_free_download_enabled:
        shouldEnable,
    })
    .eq('id', beat.id)
    .eq('producer_id', user.id)
    .select('id')
    .maybeSingle();

  if (
    updateError ||
    !updatedBeat
  ) {
    console.error(
      'Free-download availability update error:',
      updateError
    );

    redirect(
      `/dashboard?error=${encodeURIComponent(
        'The free-download setting could not be updated. Please try again.'
      )}`
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/explore');
  revalidatePath('/profile');

  if (profile.username) {
    revalidatePath(
      `/profile/${profile.username}`
    );
  }

  const successMessage =
    shouldEnable
      ? `Free downloads have been enabled for "${beat.title}".`
      : `Free downloads have been disabled for "${beat.title}".`;

  redirect(
    `/dashboard?success=${encodeURIComponent(
      successMessage
    )}`
  );
}