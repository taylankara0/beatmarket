'use client';

import CheckoutButton from '@/components/CheckoutButton';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useCart } from '@/context/CartContext';

// 1. The Payment Notification Component (Unchanged)
function PaymentNotification() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const reason = searchParams.get('reason');

    if (paymentStatus === 'success') {
      setNotification({
        type: 'success',
        title: 'Payment Successful!',
        message: 'Your beat license is now unlocked. Thank you for your purchase!',
      });
      setTimeout(() => router.replace('/explore'), 5000);
    } 
    else if (paymentStatus === 'failed') {
      setNotification({
        type: 'error',
        title: 'Payment Failed',
        message: reason ? decodeURIComponent(reason) : 'The transaction was declined by the bank.',
      });
      setTimeout(() => router.replace('/explore'), 5000);
    }
  }, [searchParams, router]);

  if (!notification) return null;

  const isSuccess = notification.type === 'success';

  return (
    <div style={{
      marginBottom: '24px',
      padding: '16px',
      borderRadius: '8px',
      border: `1px solid ${isSuccess ? '#4ade80' : '#f87171'}`,
      backgroundColor: isSuccess ? '#dcfce7' : '#fee2e2',
      color: isSuccess ? '#166534' : '#991b1b',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }}>
      <div>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>{notification.title}</h4>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>{notification.message}</p>
      </div>
      <button 
        onClick={() => setNotification(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', color: 'inherit', padding: '0 8px' }}
      >
        X
      </button>
    </div>
  );
}

// 2. The Main Explore Page Component
export default function ExplorePage() {
  const [beats, setBeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();

  useEffect(() => {
    async function loadBeats() {
      const supabase = createClient();
      
      // We fetch the beats, the producer's profile info, and all attached licenses
      const { data, error } = await supabase
        .from('beats')
        .select(`
          *,
          profiles ( username, display_name ),
          licenses (*)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setBeats(data);
      } else if (error) {
        console.error("Error loading marketplace data:", error);
      }
      setLoading(false);
    }
    loadBeats();
  }, []);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>Loading marketplace catalog...</div>;
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      
      <Suspense fallback={null}>
        <PaymentNotification />
      </Suspense>

      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Explore Instrumentals</h1>
        <p style={{ color: '#666' }}>Listen and license professional production tracks instantly.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {beats.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', margin: '40px 0' }}>No beats found in the marketplace database.</p>
        ) : (
          beats.map((beat) => (
            <div 
              key={beat.id} 
              style={{ 
                background: '#fff', 
                border: '1px solid #eee', 
                borderRadius: '12px', 
                padding: '24px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{beat.title}</h3>
                
                {/* Display the producer's name if available */}
                <p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '0.9rem' }}>
                  Produced by: <span style={{ fontWeight: 'bold' }}>{beat.profiles?.display_name || beat.profiles?.username || 'Unknown'}</span>
                </p>

                <span style={{ background: '#f0f0f2', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', color: '#555', fontWeight: 'bold' }}>
                  {beat.bpm ? `${beat.bpm} BPM` : 'Variable BPM'}
                </span>
                
                <div style={{ marginTop: '15px' }}>
                  {/* The audio player now streams the actual file uploaded to Supabase Storage */}
                  <audio controls src={beat.preview_url} style={{ height: '40px' }} />
                </div>
              </div>

              {/* Dynamic Licensing Buttons */}
              <div style={{ display: 'flex', gap: '12px', flexDirection: 'column', alignItems: 'flex-end' }}>
                {beat.licenses && beat.licenses.length > 0 ? (
                  beat.licenses
                    .sort((a, b) => a.price - b.price) // Sort prices from lowest to highest
                    .map((license) => (
                      <button 
                        key={license.id}
                        onClick={() => addToCart(beat, license.name, license.price)}
                        style={{ 
                          background: license.is_exclusive ? '#111' : '#f0f0f2', 
                          color: license.is_exclusive ? '#fff' : '#111', 
                          border: license.is_exclusive ? 'none' : '1px solid #ccc',
                          padding: '10px 16px', 
                          borderRadius: '6px', 
                          cursor: 'pointer',
                          fontWeight: '500',
                          minWidth: '200px',
                          textAlign: 'left',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>Buy {license.name}</span>
                        <span>${license.price.toFixed(2)}</span>
                      </button>
                    ))
                ) : (
                  <p style={{ fontSize: '0.9rem', color: '#999' }}>No licenses available</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}