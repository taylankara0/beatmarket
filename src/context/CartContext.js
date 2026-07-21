'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [isHydrated, setIsHydrated] =
    useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        'beatmarket_cart'
      );

      if (saved) {
        const parsedCart = JSON.parse(saved);

        if (Array.isArray(parsedCart)) {
          setCart(parsedCart);
        }
      }
    } catch (error) {
      console.error(
        'Failed to restore cart:',
        error
      );

      localStorage.removeItem(
        'beatmarket_cart'
      );
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    localStorage.setItem(
      'beatmarket_cart',
      JSON.stringify(cart)
    );
  }, [cart, isHydrated]);

  const addToCart = (newItem) => {
    setCart((previousCart) => {
      if (
        previousCart.some(
          (item) => item.id === newItem.id
        )
      ) {
        return previousCart;
      }

      return [
        ...previousCart,
        {
          ...newItem,
          price:
            Number(newItem.price) || 0
        }
      ];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((previousCart) =>
      previousCart.filter(
        (item) => item.id !== itemId
      )
    );
  };

  const clearCart = () => {
    localStorage.removeItem(
      'beatmarket_cart'
    );

    setCart([]);
  };

  const cartTotal = cart.reduce(
    (sum, item) =>
      sum + (Number(item.price) || 0),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        cartTotal,
        isHydrated
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}