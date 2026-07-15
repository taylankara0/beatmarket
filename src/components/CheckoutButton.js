'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function CheckoutButton({ beatId, price, title, userId }) {
  const [loading, setLoading] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const handleBuy = async () => {
    setLoading(true);

    try {
      // 1. Create the pending order in your database
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          beat_id: beatId,
          user_id: userId,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) throw error;

      // 2. Call your new API route to get the Iyzico payment page URL
      const response = await fetch('/api/checkout/iyzico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: beatId, title: title, price: price, licenseType: 'Basic' }],
          totalAmount: price
        })
      });

      const data = await response.json();

      if (data.paymentPageUrl) {
        // 3. Redirect the user to Iyzico
        window.location.href = data.paymentPageUrl;
      } else {
        throw new Error(data.error || 'Failed to initialize payment');
      }

    } catch (err) {
      console.error('Checkout error:', err);
      alert('Could not start checkout: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleBuy} 
      disabled={loading}
      style={{ background: '#28a745', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
    >
      {loading ? 'Redirecting...' : `Buy for $${price}`}
    </button>
  );
}