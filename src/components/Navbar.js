'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { signOutAction } from '@/app/actions';
import { useCart } from '@/context/CartContext';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isProducer, setIsProducer] = useState(false);
  const { cart } = useCart();

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function loadProducerStatus(currentUser) {
      if (!currentUser) {
        if (isMounted) {
          setIsProducer(false);
        }

        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('is_producer')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (profileError) {
        console.error(
          'Navbar producer status loading error:',
          profileError
        );

        setIsProducer(false);
        return;
      }

      setIsProducer(profile?.is_producer === true);
    }

    async function loadUser() {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError) {
        console.error('Navbar user loading error:', userError);
        setUser(null);
        setIsProducer(false);
        return;
      }

      setUser(currentUser);
      await loadProducerStatus(currentUser);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;

      if (!isMounted) {
        return;
      }

      setUser(currentUser);
      void loadProducerStatus(currentUser);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const navStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    background: '#111',
    color: '#fff',
    fontFamily: 'sans-serif',
  };

  return (
    <nav style={navStyle}>
      <div>
        <Link
          href="/explore"
          style={{
            color: '#fff',
            textDecoration: 'none',
            fontSize: '1.5rem',
            fontWeight: 'bold',
          }}
        >
          BeatMarket
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '25px',
          alignItems: 'center',
        }}
      >
        <Link
          href="/explore"
          style={{
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Explore
        </Link>

        <div
          style={{
            background: '#333',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
          }}
        >
          🛒 Cart ({cart.length})
        </div>

        {user ? (
          <>
            <Link
              href="/dashboard"
              style={{
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Dashboard
            </Link>

            {isProducer && (
              <Link
                href="/upload-beat"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                }}
              >
                Upload Beat
              </Link>
            )}

            <span
              style={{
                color: '#888',
                fontSize: '0.9rem',
              }}
            >
              {user.email}
            </span>

            <form action={signOutAction}>
              <button
                type="submit"
                style={{
                  background: '#ff3b30',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Sign Out
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              color: '#fff',
              textDecoration: 'none',
              background: '#0070f3',
              padding: '8px 16px',
              borderRadius: '6px',
            }}
          >
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}