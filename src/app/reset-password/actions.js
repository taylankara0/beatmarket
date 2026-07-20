'use server';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

export async function updatePassword(formData) {
  const password =
    formData.get('password');

  const confirmPassword =
    formData.get('confirmPassword');

  if (
    typeof password !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    return redirect(
      `/reset-password?error=${encodeURIComponent(
        'Enter and confirm your new password.'
      )}`
    );
  }

  if (password.length < 8) {
    return redirect(
      `/reset-password?error=${encodeURIComponent(
        'Your password must contain at least 8 characters.'
      )}`
    );
  }

  if (password !== confirmPassword) {
    return redirect(
      `/reset-password?error=${encodeURIComponent(
        'The passwords do not match.'
      )}`
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirect(
      `/login?error=${encodeURIComponent(
        'Your password recovery session is invalid or has expired. Request a new reset link.'
      )}`
    );
  }

  const { error: updateError } =
    await supabase.auth.updateUser({
      password,
    });

  if (updateError) {
    console.error(
      'Password update error:',
      updateError
    );

    return redirect(
      `/reset-password?error=${encodeURIComponent(
        updateError.message ||
          'Your password could not be updated.'
      )}`
    );
  }

  await supabase.auth.signOut();

  return redirect(
    `/login?message=${encodeURIComponent(
      'Your password has been updated. Sign in with your new password.'
    )}`
  );
}