import { NextResponse } from 'next/server';

import {
  PAYMENT_MODES,
  getPaymentMode
} from '../../../lib/paymentMode';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const paymentMode = getPaymentMode();

    return NextResponse.json(
      {
        paymentMode,
        paymentsEnabled:
          paymentMode !==
          PAYMENT_MODES.DISABLED
      },
      {
        headers: {
          'Cache-Control':
            'no-store, max-age=0'
        }
      }
    );
  } catch (error) {
    console.error(
      'Payment mode status error:',
      error
    );

    return NextResponse.json(
      {
        paymentMode:
          PAYMENT_MODES.DISABLED,
        paymentsEnabled: false
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store, max-age=0'
        }
      }
    );
  }
}