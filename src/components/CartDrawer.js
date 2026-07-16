'use client';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';

export default function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { cart, removeFromCart, cartTotal, clearCart } = useCart();

  const handleCheckout = async () => {
    if (cart.length === 0) return alert('Sepet boş!');
    setLoading(true);
    try {
      const response = await fetch('/api/checkout/iyzico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, totalAmount: cartTotal }),
      });
      const data = await response.json();
      if (data.success && data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
      } else {
        alert(`Hata: ${data.error}`);
      }
    } catch (error) {
      alert('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} style={{ position: 'fixed', bottom: 30, right: 30, background: '#0070f3', color: '#fff', padding: '16px 24px', borderRadius: 50, cursor: 'pointer', zIndex: 999 }}>
        Sepet ({cart.length}) — {(Number(cartTotal) || 0).toFixed(2)}₺
      </button>

      {isOpen && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '360px', height: '100vh', background: '#fff', zIndex: 1000, padding: '20px', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Sepetiniz</h2>
            <button onClick={() => setIsOpen(false)}>×</button>
          </div>
          {cart.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
              <div>{item.title} <br/> <small>{item.licenseType}</small></div>
              <div style={{ textAlign: 'right' }}>
                {(Number(item.price) || 0).toFixed(2)}₺ <br/>
                <button onClick={() => removeFromCart(item.id)} style={{ color: 'red', border: 'none', background: 'none' }}>Sil</button>
              </div>
            </div>
          ))}
          <div style={{ marginTop: '20px', fontWeight: 'bold' }}>Toplam: {(Number(cartTotal) || 0).toFixed(2)}₺</div>
          <button onClick={handleCheckout} disabled={loading} style={{ width: '100%', background: '#22c55e', color: '#fff', padding: '10px', marginTop: '10px', borderRadius: '5px', cursor: 'pointer' }}>
            {loading ? 'Bağlanıyor...' : 'Iyzico ile Öde'}
          </button>
        </div>
      )}
    </>
  );
}