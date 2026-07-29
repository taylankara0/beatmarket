'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

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
    .select('is_producer')
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
  revalidatePath('/explore');

  redirect(
    `/dashboard?success=${encodeURIComponent(
      'Your producer display name has been saved.'
    )}`
  );
}