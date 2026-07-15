'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { signOutAction } from '@/app/actions';
import { useCart } from '@/context/CartContext';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const { cart } = useCart();

  useEffect(() => {
    const supabase = createClient();
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    getUser();
  }, []);

  const navStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    background: '#111',
    color: '#fff',
    fontFamily: 'sans-serif'
  };

  return (
    <nav style={navStyle}>
      <div>
        <Link href="/explore" style={{ color: '#fff', textDecoration: 'none', fontSize: '1.5rem', fontWeight: 'bold' }}>
          BeatMarket
        </Link>
      </div>
      
      <div style={{ display: 'flex', gap: '25px', alignItems: 'center' }}>
        <Link href="/explore" style={{ color: '#fff', textDecoration: 'none' }}>Explore</Link>
        
        <div style={{ background: '#333', padding: '6px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
          🛒 Cart ({cart.length})
        </div>

        {user ? (
          <>
            <Link href="/dashboard" style={{ color: '#fff', textDecoration: 'none' }}>Dashboard</Link>
            <Link href="/upload-beat" style={{ color: '#fff', textDecoration: 'none' }}>Upload Beat</Link>
            <span style={{ color: '#888', fontSize: '0.9rem' }}>{user.email}</span>
            <form action={signOutAction}>
              <button type="submit" style={{ background: '#ff3b30', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Sign Out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" style={{ color: '#fff', textDecoration: 'none', background: '#0070f3', padding: '8px 16px', borderRadius: '6px' }}>
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}