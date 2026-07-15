'use client';

import { useState } from 'react';
import { useCart } from '@/context/CartContext';

export default function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { cart, removeFromCart, cartTotal, clearCart } = useCart();

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/checkout/iyzico', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cart,
          totalAmount: cartTotal,
        }),
      });

      const data = await response.json();

      if (data.paymentPageUrl) {
        // Redirect the buyer directly to iyzico's secure sandbox payment page
        window.location.href = data.paymentPageUrl;
      } else {
        alert(`Checkout Error: ${data.error || 'Failed to initialize payment form.'}`);
      }
    } catch (error) {
      console.error('Checkout communication error:', error);
      alert('An error occurred while connecting to the checkout gateway.');
    } finally {
      setLoading(false);
    }
  };

  const drawerStyle = {
    position: 'fixed',
    top: 0,
    right: isOpen ? 0 : '-400px',
    width: '360px',
    height: '100vh',
    background: '#fff',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    transition: 'right 0.3s ease-in-out',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'sans-serif',
    color: '#111'
  };

  const toggleButtonStyle = {
    position: 'fixed',
    bottom: '30px',
    right: '30px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '50px',
    padding: '16px 24px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,112,243,0.3)',
    zIndex: 999
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} style={toggleButtonStyle}>
        Cart ({cart.length}) — ${cartTotal.toFixed(2)}
      </button>

      <div style={drawerStyle}>
        <div style={{ padding: '24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Your Cart</h2>
          <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' }}>
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {cart.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>Your cart is empty.</p>
          ) : (
            cart.map((item) => (
              <div key={`${item.id}-${item.licenseType}`} style={{ borderBottom: '1px solid #f5f5f7', paddingBottom: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem' }}>{item.title}</h4>
                  <span style={{ fontSize: '0.8rem', color: '#0070f3', fontWeight: 'bold', background: '#e6f0ff', padding: '2px 6px', borderRadius: '4px' }}>
                    {item.licenseType} License
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '5px' }}>${item.price.toFixed(2)}</div>
                  <button 
                    onClick={() => removeFromCart(item.id, item.licenseType)}
                    style={{ background: 'none', border: 'none', color: '#ff3b30', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div style={{ padding: '24px', borderTop: '1px solid #eee', background: '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: 'bold', fontSize: '1.1rem' }}>
              <span>Total:</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            <button 
              onClick={handleCheckout}
              disabled={loading}
              style={{ 
                width: '100%', 
                background: loading ? '#666' : '#22c55e', // Green for successful native checkout look
                color: '#fff', 
                border: 'none', 
                padding: '14px', 
                borderRadius: '8px', 
                fontSize: '1rem', 
                fontWeight: 'bold', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                marginBottom: '10px' 
              }}
            >
              {loading ? 'Connecting...' : 'Pay with iyzico'}
            </button>
            <button 
              onClick={clearCart}
              style={{ width: '100%', background: 'none', border: '1px solid #ccc', color: '#666', padding: '10px', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Clear All Items
            </button>
          </div>
        )}
      </div>
    </>
  );
}