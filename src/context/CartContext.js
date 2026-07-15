'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  // Load cart from localStorage on initial render
  useEffect(() => {
    const savedCart = localStorage.getItem('beatmarket_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('beatmarket_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (beat, licenseType, price) => {
    setCart((prevCart) => {
      // Prevent adding the exact same beat with the same license twice
      const exists = prevCart.some(
        (item) => item.id === beat.id && item.licenseType === licenseType
      );
      if (exists) return prevCart;

      return [...prevCart, { ...beat, licenseType, price }];
    });
  };

  const removeFromCart = (beatId, licenseType) => {
    setCart((prevCart) =>
      prevCart.filter((item) => !(item.id === beatId && item.licenseType === licenseType))
    );
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, cartTotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}