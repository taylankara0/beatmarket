'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

function buildDashboardUrl(type, message) {
  const searchParams = new URLSearchParams({
    [type]: message,
  });

  return `/dashboard?${searchParams.toString()}`;
}

function normalizeAccountHolderName(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : '';
}

function normalizeIban(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').toUpperCase()
    : '';
}

export async function saveProducerPayoutAccount(formData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const accountHolderName = normalizeAccountHolderName(
    formData.get('account_holder_name')
  );

  const iban = normalizeIban(formData.get('iban'));

  if (
    accountHolderName.length < 2 ||
    accountHolderName.length > 120
  ) {
    redirect(
      buildDashboardUrl(
        'error',
        'Enter a valid account holder name.'
      )
    );
  }

  if (!/^TR[0-9]{24}$/.test(iban)) {
    redirect(
      buildDashboardUrl(
        'error',
        'Enter a valid Turkish IBAN.'
      )
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
    !profile ||
    profile.is_producer !== true
  ) {
    redirect(
      buildDashboardUrl(
        'error',
        'Only active producers can save payout details.'
      )
    );
  }

  const {
    error: payoutAccountError,
  } = await supabase
    .from('producer_payout_accounts')
    .upsert(
      {
        producer_id: user.id,
        account_holder_name: accountHolderName,
        iban,
        currency: 'TRY',
      },
      {
        onConflict: 'producer_id',
      }
    );

  if (payoutAccountError) {
    console.error(
      'Payout account saving error:',
      payoutAccountError
    );

    redirect(
      buildDashboardUrl(
        'error',
        'Your payout account could not be saved.'
      )
    );
  }

  redirect(
    buildDashboardUrl(
      'success',
      'Your payout account was saved.'
    )
  );
}

export async function requestProducerPayout() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const {
    error: payoutRequestError,
  } = await supabase.rpc(
    'request_producer_payout'
  );

  if (payoutRequestError) {
    console.error(
      'Payout request creation error:',
      payoutRequestError
    );

    redirect(
      buildDashboardUrl(
        'error',
        payoutRequestError.message ||
          'Your payout request could not be created.'
      )
    );
  }

  redirect(
    buildDashboardUrl(
      'success',
      'Your payout request was submitted.'
    )
  );
}

export async function cancelProducerPayout(formData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const payoutRequestId =
    typeof formData.get('payout_request_id') === 'string'
      ? formData.get('payout_request_id').trim()
      : '';

  if (!payoutRequestId) {
    redirect(
      buildDashboardUrl(
        'error',
        'The payout request ID is missing.'
      )
    );
  }

  const {
    error: cancellationError,
  } = await supabase.rpc(
    'cancel_producer_payout',
    {
      target_payout_request_id: payoutRequestId,
    }
  );

  if (cancellationError) {
    console.error(
      'Payout cancellation error:',
      cancellationError
    );

    redirect(
      buildDashboardUrl(
        'error',
        cancellationError.message ||
          'The payout request could not be cancelled.'
      )
    );
  }

  redirect(
    buildDashboardUrl(
      'success',
      'Your payout request was cancelled.'
    )
  );
}