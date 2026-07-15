import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request) {
  console.log('--- iyzico IYZWSv2 CHECKOUT INITIALIZATION ---');

  try {
    const { items, totalAmount } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Use environment variables for security
    const apiKey = process.env.IYZICO_API_KEY;
    const secretKey = process.env.IYZICO_SECRET_KEY;

    const uriPath = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
    const randomKey = Date.now().toString();

    const basketItems = items.map((item) => ({
      id: item.id || `BI_${Date.now()}`,
      name: `${item.title || 'Beat'} - ${item.licenseType || 'License'}`,
      category1: "Digital Audio",
      itemType: "VIRTUAL",
      price: parseFloat(item.price).toFixed(2),
    }));

    const iyzicoPayload = {
      locale: "tr",
      conversationId: `ORDER_${randomKey}`,
      price: totalAmount.toFixed(2),
      paidPrice: totalAmount.toFixed(2),
      currency: "TRY",
      basketId: `BASKET_${randomKey}`,
      paymentGroup: "PRODUCT",
      callbackUrl: "http://localhost:3000/api/checkout/iyzico/callback",
      buyer: {
        id: "BY789",
        name: "Test",
        surname: "Buyer",
        gsmNumber: "+905350000000",
        email: "email@email.com",
        identityNumber: "74300864791",
        registrationAddress: "Ankara",
        city: "Ankara",
        country: "Turkey",
        zipCode: "06100"
      },
      shippingAddress: { contactName: "Test Buyer", city: "Ankara", country: "Turkey", address: "Ankara", zipCode: "06100" },
      billingAddress: { contactName: "Test Buyer", city: "Ankara", country: "Turkey", address: "Ankara", zipCode: "06100" },
      basketItems: basketItems
    };

    const requestBody = JSON.stringify(iyzicoPayload);
    
    // Generate V2 Hash Signature
    const hashString = randomKey + uriPath + requestBody;
    const signature = crypto.createHmac("sha256", secretKey).update(hashString, 'utf8').digest("hex");
    
    const authorizationStr = Buffer.from(
      `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`
    ).toString("base64");

    const response = await fetch(`https://sandbox-api.iyzipay.com${uriPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `IYZWSv2 ${authorizationStr}`,
          'x-iyzi-rnd': randomKey,
          'Content-Type': 'application/json'
        },
        body: requestBody
    });

    const result = await response.json();
    console.log('--- IYZICO V2 RESPONSE ---', result);

    if (result.status === 'success' && result.paymentPageUrl) {
      return NextResponse.json({ paymentPageUrl: result.paymentPageUrl });
    } else {
      return NextResponse.json({ 
        error: `${result.errorMessage || 'Unknown Error'} (Code: ${result.errorCode})` 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Checkout API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}