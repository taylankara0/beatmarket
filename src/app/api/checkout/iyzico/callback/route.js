import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request) {
  try {
    console.log('--- iyzico Callback Triggered ---');

    // 1. Extract the token iyzico sent via Form POST
    const formData = await request.formData();
    const token = formData.get('token');

    if (!token) {
      console.error('No token found in callback request');
      return NextResponse.redirect(new URL('/explore?payment=missing_token', request.url));
    }

    const apiKey = process.env.IYZICO_API_KEY?.trim();
    const secretKey = process.env.IYZICO_SECRET_KEY?.trim();

    // 2. Build the exact payload to retrieve the payment result
    const retrievePayload = {
      locale: 'tr',
      token: token
    };
    
    const requestBody = JSON.stringify(retrievePayload);

    // 3. Generate the IYZWSv2 Signature for the 'detail' endpoint
    const uriPath = "/payment/iyzipos/checkoutform/auth/ecom/detail";
    const randomKey = Date.now().toString();

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(randomKey + uriPath + requestBody)
      .digest("hex");

    const authorizationStr = Buffer.from(
      `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`
    ).toString("base64");

    // 4. Ask iyzico for the final truth about this transaction
    const response = await fetch(`https://sandbox-api.iyzipay.com${uriPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `IYZWSv2 ${authorizationStr}`,
        'x-iyzi-rnd': randomKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

    const result = await response.json();
    console.log('--- IYZICO FINAL PAYMENT VERIFICATION ---', result);

    // 5. Route the user based on the real payment status
    if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
      
      // ✅ SUCCESS! The money is in your account.
      // TODO: Update Supabase to mark the order as PAID and grant beat access here.
      
      console.log(`Payment CONFIRMED for basket: ${result.basketId}`);
      return NextResponse.redirect(new URL('/explore?payment=success', request.url));
      
    } else {
      // ❌ FAILURE (Card declined, insufficient funds, 3D secure failed, etc.)
      console.error('Payment rejected by bank:', result.errorMessage);
      return NextResponse.redirect(new URL(`/explore?payment=failed&reason=${encodeURIComponent(result.errorMessage || 'Declined')}`, request.url));
    }

  } catch (error) {
    console.error('Callback processing crash:', error);
    return NextResponse.redirect(new URL('/explore?payment=error', request.url));
  }
}