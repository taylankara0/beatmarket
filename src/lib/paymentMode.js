import 'server-only';

export const PAYMENT_MODES = Object.freeze({
  DISABLED: 'disabled',
  SANDBOX: 'sandbox',
  LIVE: 'live'
});

const VALID_PAYMENT_MODES = new Set(
  Object.values(PAYMENT_MODES)
);

export function getPaymentMode() {
  const configuredMode =
    process.env.PAYMENT_MODE
      ?.trim()
      .toLowerCase() ||
    PAYMENT_MODES.DISABLED;

  if (!VALID_PAYMENT_MODES.has(configuredMode)) {
    throw new Error(
      `Invalid PAYMENT_MODE: "${configuredMode}". Expected disabled, sandbox, or live.`
    );
  }

  return configuredMode;
}

export function arePaymentsEnabled() {
  return (
    getPaymentMode() !==
    PAYMENT_MODES.DISABLED
  );
}

export function isSandboxPaymentMode() {
  return (
    getPaymentMode() ===
    PAYMENT_MODES.SANDBOX
  );
}

export function isLivePaymentMode() {
  return (
    getPaymentMode() ===
    PAYMENT_MODES.LIVE
  );
}