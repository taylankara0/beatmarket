'use server';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function getSiteUrl() {
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL
      ?.trim()
      .replace(/\/+$/, '');

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  return 'http://localhost:3000';
}

function logAuthError(
  context,
  error,
  extra = {}
) {
  console.error(context, {
    name:
      typeof error?.name === 'string'
        ? error.name
        : null,

    message:
      typeof error?.message === 'string'
        ? error.message
        : null,

    status:
      typeof error?.status === 'number'
        ? error.status
        : null,

    code:
      typeof error?.code === 'string'
        ? error.code
        : null,

    ...extra,
  });
}

export async function login(formData) {
  const email = normalizeEmail(
    formData.get('email')
  );

  const password =
    formData.get('password');

  if (
    !email ||
    typeof password !== 'string' ||
    !password
  ) {
    return redirect(
      `/login?error=${encodeURIComponent(
        'Email and password are required.'
      )}`
    );
  }

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth
      .signInWithPassword({
        email,
        password,
      });

  if (error) {
    logAuthError(
      'Login error:',
      error
    );

    return redirect(
      `/login?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  return redirect('/dashboard');
}

export async function signup(formData) {
  const email = normalizeEmail(
    formData.get('email')
  );

  const password =
    formData.get('password');

  const confirmPassword =
    formData.get('confirmPassword');

  if (!email) {
    return redirect(
      `/register?error=${encodeURIComponent(
        'Email address is required.'
      )}`
    );
  }

  if (
    typeof password !== 'string' ||
    !password
  ) {
    return redirect(
      `/register?error=${encodeURIComponent(
        'Password is required.'
      )}`
    );
  }

  if (
    typeof confirmPassword !== 'string' ||
    !confirmPassword
  ) {
    return redirect(
      `/register?error=${encodeURIComponent(
        'Please confirm your password.'
      )}`
    );
  }

  if (password.length < 8) {
    return redirect(
      `/register?error=${encodeURIComponent(
        'Your password must contain at least 8 characters.'
      )}`
    );
  }

  if (password !== confirmPassword) {
    return redirect(
      `/register?error=${encodeURIComponent(
        'The passwords do not match.'
      )}`
    );
  }

  const supabase =
    await createClient();

  const siteUrl =
    getSiteUrl();

  const emailRedirectTo =
    `${siteUrl}/auth/callback?next=/dashboard`;

  const { error } =
    await supabase.auth.signUp({
      email,
      password,

      options: {
        emailRedirectTo,
      },
    });

  if (error) {
    logAuthError(
      'Registration error:',
      error,
      {
        emailRedirectTo,
      }
    );

    return redirect(
      `/register?error=${encodeURIComponent(
        error.message ||
          'Your account could not be created.'
      )}`
    );
  }

  return redirect(
    `/login?message=${encodeURIComponent(
      'Check your email to confirm your registration.'
    )}`
  );
}

export async function requestPasswordReset(
  formData
) {
  const email = normalizeEmail(
    formData.get('email')
  );

  if (!email) {
    return redirect(
      `/login?error=${encodeURIComponent(
        'Enter your email address before requesting a password reset.'
      )}`
    );
  }

  const supabase =
    await createClient();

  const siteUrl =
    getSiteUrl();

  const redirectTo =
    `${siteUrl}/auth/callback?next=/reset-password`;

  const { error } =
    await supabase.auth
      .resetPasswordForEmail(
        email,
        {
          redirectTo,
        }
      );

  if (error) {
    logAuthError(
      'Password recovery email error:',
      error,
      {
        redirectTo,
      }
    );

    return redirect(
      `/login?error=${encodeURIComponent(
        'The password reset email could not be sent. Please try again.'
      )}`
    );
  }

  return redirect(
    `/login?message=${encodeURIComponent(
      'If an account exists for that email, a password reset link has been sent.'
    )}`
  );
}