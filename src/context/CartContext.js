'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('beatmarket_cart');
    if (saved) setCart(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('beatmarket_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (newItem) => {
    setCart((prev) => {
      if (prev.some((i) => i.id === newItem.id)) return prev;
      return [...prev, { ...newItem, price: Number(newItem.price) || 0 }];
    });
  };

  const removeFromCart = (itemId) => setCart((prev) => prev.filter((i) => i.id !== itemId));
  const clearCart = () => setCart([]);
  const cartTotal = cart.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, cartTotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() { return useContext(CartContext); }