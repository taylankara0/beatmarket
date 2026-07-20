import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSafeNextPath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }

  return value;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);

  const code =
    requestUrl.searchParams.get('code');

  const nextPath =
    getSafeNextPath(
      requestUrl.searchParams.get('next')
    );

  if (!code) {
    const loginUrl = new URL(
      '/login',
      requestUrl.origin
    );

    loginUrl.searchParams.set(
      'error',
      'The password recovery link is invalid or incomplete.'
    );

    return NextResponse.redirect(
      loginUrl,
      303
    );
  }

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth
      .exchangeCodeForSession(code);

  if (error) {
    console.error(
      'Supabase auth callback error:',
      error
    );

    const loginUrl = new URL(
      '/login',
      requestUrl.origin
    );

    loginUrl.searchParams.set(
      'error',
      'The password recovery link is invalid or has expired. Request a new link.'
    );

    return NextResponse.redirect(
      loginUrl,
      303
    );
  }

  const destinationUrl = new URL(
    nextPath,
    requestUrl.origin
  );

  return NextResponse.redirect(
    destinationUrl,
    303
  );
}