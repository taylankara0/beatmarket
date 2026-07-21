'use client';

import {
  useEffect,
  useRef
} from 'react';

import {
  useCart
} from '../../../context/CartContext';

export default function ClearCartOnSuccess() {
  const {
    clearCart,
    isHydrated
  } = useCart();

  const hasClearedCart = useRef(false);

  useEffect(() => {
    if (
      !isHydrated ||
      hasClearedCart.current
    ) {
      return;
    }

    hasClearedCart.current = true;
    clearCart();
  }, [
    clearCart,
    isHydrated
  ]);

  return null;
}