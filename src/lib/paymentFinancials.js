import 'server-only';

export const PLATFORM_COMMISSION_RATE =
  10.00;

function decimalToCents(value) {
  const normalizedValue =
    String(value).trim();

  if (
    !/^\d+(\.\d{1,2})?$/.test(
      normalizedValue
    )
  ) {
    throw new Error(
      `Invalid money value: "${normalizedValue}".`
    );
  }

  const [
    wholePart,
    decimalPart = ''
  ] = normalizedValue.split('.');

  const paddedDecimalPart =
    decimalPart.padEnd(2, '0');

  const cents =
    Number(wholePart) * 100 +
    Number(paddedDecimalPart);

  if (
    !Number.isSafeInteger(cents) ||
    cents < 0
  ) {
    throw new Error(
      `Money value is outside the supported range: "${normalizedValue}".`
    );
  }

  return cents;
}

function centsToDecimal(cents) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0
  ) {
    throw new Error(
      'Money cents must be a nonnegative safe integer.'
    );
  }

  return (cents / 100).toFixed(2);
}

export function createItemFinancialSnapshot({
  grossAmount,
  currency = 'TRY'
}) {
  const grossCents =
    decimalToCents(grossAmount);

  const commissionBasisPoints =
    Math.round(
      PLATFORM_COMMISSION_RATE * 100
    );

  const platformFeeCents =
    Math.round(
      grossCents *
        commissionBasisPoints /
        10000
    );

  const producerEarningCents =
    grossCents -
    platformFeeCents;

  const normalizedCurrency =
    String(currency)
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      normalizedCurrency
    )
  ) {
    throw new Error(
      `Invalid currency code: "${normalizedCurrency}".`
    );
  }

  return {
    grossAmount:
      centsToDecimal(grossCents),

    platformFeeAmount:
      centsToDecimal(
        platformFeeCents
      ),

    producerEarningAmount:
      centsToDecimal(
        producerEarningCents
      ),

    commissionRate:
      PLATFORM_COMMISSION_RATE
        .toFixed(2),

    currency:
      normalizedCurrency
  };
}