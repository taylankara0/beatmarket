'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';

import {
  useCart
} from '@/context/CartContext';

const CHECKOUT_ATTEMPT_STORAGE_KEY =
  'beatmarket_checkout_attempt';

const CHECKOUT_ATTEMPT_MAX_AGE_MS =
  60 * 60 * 1000;

function createIdempotencyKey() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  randomBytes[6] =
    (randomBytes[6] & 0x0f) | 0x40;

  randomBytes[8] =
    (randomBytes[8] & 0x3f) | 0x80;

  const hexadecimalBytes = Array.from(
    randomBytes,
    (byte) =>
      byte
        .toString(16)
        .padStart(2, '0')
  );

  return [
    hexadecimalBytes.slice(0, 4).join(''),
    hexadecimalBytes.slice(4, 6).join(''),
    hexadecimalBytes.slice(6, 8).join(''),
    hexadecimalBytes.slice(8, 10).join(''),
    hexadecimalBytes.slice(10, 16).join(''),
  ].join('-');
}

function createCartFingerprint(cart) {
  const normalizedItems = cart
    .map((item) => {
      const beatId =
        item.beatId ??
        item.beat_id ??
        item.beat?.id ??
        item.id ??
        '';

      const licenseId =
        item.licenseId ??
        item.license_id ??
        item.license?.id ??
        '';

      return {
        beatId: String(beatId),
        licenseId: String(licenseId),
      };
    })
    .sort((firstItem, secondItem) => {
      const firstKey =
        `${firstItem.beatId}:${firstItem.licenseId}`;

      const secondKey =
        `${secondItem.beatId}:${secondItem.licenseId}`;

      return firstKey.localeCompare(
        secondKey
      );
    });

  return JSON.stringify(normalizedItems);
}

function removeStoredCheckoutAttempt() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY
    );
  } catch {
    /*
      Checkout can continue even when
      sessionStorage is unavailable.
    */
  }
}

function getCheckoutIdempotencyKey(cart) {
  const cartFingerprint =
    createCartFingerprint(cart);

  if (typeof window !== 'undefined') {
    try {
      const savedValue =
        window.sessionStorage.getItem(
          CHECKOUT_ATTEMPT_STORAGE_KEY
        );

      if (savedValue) {
        const savedAttempt =
          JSON.parse(savedValue);

        const createdAt =
          Number(savedAttempt?.createdAt);

        const attemptIsCurrent =
          Number.isFinite(createdAt) &&
          Date.now() - createdAt <
            CHECKOUT_ATTEMPT_MAX_AGE_MS;

        if (
          attemptIsCurrent &&
          savedAttempt?.cartFingerprint ===
            cartFingerprint &&
          typeof savedAttempt?.idempotencyKey ===
            'string'
        ) {
          return savedAttempt.idempotencyKey;
        }
      }
    } catch {
      removeStoredCheckoutAttempt();
    }
  }

  const idempotencyKey =
    createIdempotencyKey();

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        CHECKOUT_ATTEMPT_STORAGE_KEY,
        JSON.stringify({
          idempotencyKey,
          cartFingerprint,
          createdAt: Date.now(),
        })
      );
    } catch {
      /*
        The request can still use the
        in-memory idempotency key.
      */
    }
  }

  return idempotencyKey;
}

export default function CartDrawer() {
  const [isOpen, setIsOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [
    paymentModeLoading,
    setPaymentModeLoading
  ] = useState(true);

  const [
    paymentsEnabled,
    setPaymentsEnabled
  ] = useState(false);

  const [
    paymentMode,
    setPaymentMode
  ] = useState('disabled');

  const checkoutInProgressRef =
    useRef(false);

  const {
    cart,
    removeFromCart,
    cartTotal,
  } = useCart();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const abortController =
      new AbortController();

    async function loadPaymentMode() {
      setPaymentModeLoading(true);

      try {
        const response = await fetch(
          '/api/payment-mode',
          {
            method: 'GET',
            cache: 'no-store',
            signal:
              abortController.signal,
          }
        );

        const data = await response
          .json()
          .catch(() => null);

        if (
          !response.ok ||
          !data
        ) {
          throw new Error(
            'Payment availability could not be loaded.'
          );
        }

        setPaymentMode(
          typeof data.paymentMode ===
            'string'
            ? data.paymentMode
            : 'disabled'
        );

        setPaymentsEnabled(
          data.paymentsEnabled === true
        );
      } catch (error) {
        if (
          error?.name ===
          'AbortError'
        ) {
          return;
        }

        console.error(
          'Payment mode loading error:',
          error
        );

        /*
          Fail closed. A frontend status
          error must never enable checkout.
        */
        setPaymentMode('disabled');
        setPaymentsEnabled(false);
      } finally {
        if (
          !abortController.signal.aborted
        ) {
          setPaymentModeLoading(false);
        }
      }
    }

    loadPaymentMode();

    return () => {
      abortController.abort();
    };
  }, [isOpen]);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Sepet boş!');
      return;
    }

    if (
      paymentModeLoading ||
      !paymentsEnabled
    ) {
      alert(
        'Payments are not currently available.'
      );

      return;
    }

    if (checkoutInProgressRef.current) {
      return;
    }

    checkoutInProgressRef.current = true;
    setLoading(true);

    const idempotencyKey =
      getCheckoutIdempotencyKey(cart);

    try {
      const response = await fetch(
        '/api/checkout/iyzico',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Idempotency-Key':
              idempotencyKey,
          },

          body: JSON.stringify({
            items: cart,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (
        response.ok &&
        data?.success &&
        data?.paymentPageUrl
      ) {
        window.location.assign(
          data.paymentPageUrl
        );

        return;
      }

      /*
        Keep the same key only when the backend says that
        the original request is still being processed.
      */
      if (!data?.retryable) {
        removeStoredCheckoutAttempt();
      }

      alert(
        `Hata: ${
          data?.error ||
          'Ödeme işlemi başlatılamadı.'
        }`
      );
    } catch (error) {
      /*
        Keep the key after a network failure. The backend may
        have processed the request even though the response
        did not reach the browser.
      */
      console.error(
        'Checkout connection error:',
        error
      );

      alert('Bağlantı hatası.');
    } finally {
      checkoutInProgressRef.current =
        false;

      setLoading(false);
    }
  };

  const checkoutDisabled =
    loading ||
    paymentModeLoading ||
    !paymentsEnabled ||
    cart.length === 0;

  let checkoutButtonText =
    'Iyzico ile Öde';

  if (loading) {
    checkoutButtonText =
      'Bağlanıyor...';
  } else if (paymentModeLoading) {
    checkoutButtonText =
      'Ödeme Durumu Kontrol Ediliyor...';
  } else if (!paymentsEnabled) {
    checkoutButtonText =
      'Payments Coming Soon';
  } else if (
    paymentMode === 'sandbox'
  ) {
    checkoutButtonText =
      'Iyzico ile Test Ödemesi';
  }

  return (
    <>
      <button
        onClick={() =>
          setIsOpen(
            (currentValue) =>
              !currentValue
          )
        }
        style={{
          position: 'fixed',
          bottom: 30,
          right: 30,
          background: '#0070f3',
          color: '#fff',
          padding: '16px 24px',
          borderRadius: 50,
          cursor: 'pointer',
          zIndex: 999,
        }}
      >
        Sepet ({cart.length}) —{' '}
        {(Number(cartTotal) || 0).toFixed(2)}₺
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '360px',
            height: '100vh',
            background: '#fff',
            zIndex: 1000,
            padding: '20px',
            boxShadow:
              '-4px 0 20px rgba(0,0,0,0.1)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems: 'center',
            }}
          >
            <h2>Sepetiniz</h2>

            <button
              onClick={() =>
                setIsOpen(false)
              }
            >
              ×
            </button>
          </div>

          {cart.length === 0 ? (
            <p
              style={{
                marginTop: '20px',
                color: '#666',
              }}
            >
              Sepetiniz boş.
            </p>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  padding: '10px 0',
                  borderBottom:
                    '1px solid #eee',
                }}
              >
                <div>
                  {item.title}
                  <br />

                  <small>
                    {item.licenseType}
                  </small>
                </div>

                <div
                  style={{
                    textAlign: 'right',
                  }}
                >
                  {(Number(item.price) || 0).toFixed(2)}₺
                  <br />

                  <button
                    onClick={() =>
                      removeFromCart(
                        item.id
                      )
                    }
                    style={{
                      color: 'red',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))
          )}

          <div
            style={{
              marginTop: '20px',
              fontWeight: 'bold',
            }}
          >
            Toplam:{' '}
            {(Number(cartTotal) || 0).toFixed(2)}₺
          </div>

          {!paymentModeLoading &&
            !paymentsEnabled && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                Payments are currently
                disabled. You can still
                review and manage your cart.
              </div>
            )}

          {!paymentModeLoading &&
            paymentsEnabled &&
            paymentMode ===
              'sandbox' && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#dbeafe',
                  color: '#1e40af',
                  fontSize: '14px',
                  lineHeight: 1.5,
                }}
              >
                Test payment mode is active.
                No real payment will be
                processed.
              </div>
            )}

          <button
            onClick={handleCheckout}
            disabled={checkoutDisabled}
            style={{
              width: '100%',
              background:
                checkoutDisabled
                  ? '#9ca3af'
                  : '#22c55e',
              color: '#fff',
              padding: '10px',
              marginTop: '10px',
              border: 'none',
              borderRadius: '5px',
              cursor:
                checkoutDisabled
                  ? 'not-allowed'
                  : 'pointer',
              opacity:
                checkoutDisabled
                  ? 0.75
                  : 1,
            }}
          >
            {checkoutButtonText}
          </button>
        </div>
      )}
    </>
  );
}