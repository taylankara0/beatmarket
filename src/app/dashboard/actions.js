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

  const { data: activated, error: activationError } = await supabase.rpc(
    'activate_producer_profile'
  );

  if (activationError || activated !== true) {
    console.error('Producer activation error:', activationError);

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