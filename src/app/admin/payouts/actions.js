'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase-server';

function buildAdminPayoutUrl(type, message) {
  const searchParams = new URLSearchParams({
    [type]: message,
  });

  return `/admin/payouts?${searchParams.toString()}`;
}

function getFormText(formData, fieldName) {
  const value = formData.get(fieldName);

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function getAuthenticatedClient() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  return supabase;
}

export async function approvePayoutRequest(formData) {
  const payoutRequestId = getFormText(
    formData,
    'payout_request_id'
  );

  if (!isValidUuid(payoutRequestId)) {
    redirect(
      buildAdminPayoutUrl(
        'error',
        'The payout request ID is invalid.'
      )
    );
  }

  const supabase = await getAuthenticatedClient();

  const { error: approvalError } = await supabase.rpc(
    'approve_producer_payout',
    {
      target_payout_request_id: payoutRequestId,
    }
  );

  if (approvalError) {
    console.error(
      'Payout approval error:',
      approvalError
    );

    redirect(
      buildAdminPayoutUrl(
        'error',
        approvalError.message ||
          'The payout request could not be approved.'
      )
    );
  }

  revalidatePath('/admin/payouts');

  redirect(
    buildAdminPayoutUrl(
      'success',
      'The payout request was approved.'
    )
  );
}

export async function rejectPayoutRequest(formData) {
  const payoutRequestId = getFormText(
    formData,
    'payout_request_id'
  );

  const rejectionReason = getFormText(
    formData,
    'rejection_reason'
  );

  if (!isValidUuid(payoutRequestId)) {
    redirect(
      buildAdminPayoutUrl(
        'error',
        'The payout request ID is invalid.'
      )
    );
  }

  if (
    rejectionReason.length < 2 ||
    rejectionReason.length > 500
  ) {
    redirect(
      buildAdminPayoutUrl(
        'error',
        'Enter a rejection reason between 2 and 500 characters.'
      )
    );
  }

  const supabase = await getAuthenticatedClient();

  const { error: rejectionError } = await supabase.rpc(
    'reject_producer_payout',
    {
      target_payout_request_id: payoutRequestId,
      rejection_reason_value: rejectionReason,
    }
  );

  if (rejectionError) {
    console.error(
      'Payout rejection error:',
      rejectionError
    );

    redirect(
      buildAdminPayoutUrl(
        'error',
        rejectionError.message ||
          'The payout request could not be rejected.'
      )
    );
  }

  revalidatePath('/admin/payouts');
  revalidatePath('/dashboard');

  redirect(
    buildAdminPayoutUrl(
      'success',
      'The payout request was rejected.'
    )
  );
}

export async function completePayoutRequest(formData) {
  const payoutRequestId = getFormText(
    formData,
    'payout_request_id'
  );

  const bankTransferReference = getFormText(
    formData,
    'bank_transfer_reference'
  );

  if (!isValidUuid(payoutRequestId)) {
    redirect(
      buildAdminPayoutUrl(
        'error',
        'The payout request ID is invalid.'
      )
    );
  }

  if (
    bankTransferReference.length < 2 ||
    bankTransferReference.length > 250
  ) {
    redirect(
      buildAdminPayoutUrl(
        'error',
        'Enter a bank transfer reference between 2 and 250 characters.'
      )
    );
  }

  const supabase = await getAuthenticatedClient();

  const { error: completionError } = await supabase.rpc(
    'complete_producer_payout',
    {
      target_payout_request_id: payoutRequestId,
      bank_transfer_reference_value:
        bankTransferReference,
    }
  );

  if (completionError) {
    console.error(
      'Payout completion error:',
      completionError
    );

    redirect(
      buildAdminPayoutUrl(
        'error',
        completionError.message ||
          'The payout request could not be completed.'
      )
    );
  }

  revalidatePath('/admin/payouts');
  revalidatePath('/dashboard');

  redirect(
    buildAdminPayoutUrl(
      'success',
      'The payout request was marked as paid.'
    )
  );
}