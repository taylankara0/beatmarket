import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

import UploadBeatClient from './UploadBeatClient';

export default async function UploadBeatPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(
      `/login?error=${encodeURIComponent(
        'You must be signed in to upload beats.'
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
    redirect(
      `/dashboard?error=${encodeURIComponent(
        'Activate your producer profile before uploading beats.'
      )}`
    );
  }

  return <UploadBeatClient />;
}