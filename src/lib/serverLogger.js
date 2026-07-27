import 'server-only';

import {
  randomUUID
} from 'crypto';

const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_NESTING_DEPTH = 5;

const SENSITIVE_KEY_PARTS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apikey',
  'servicekey',
  'servicerole',
  'privatekey',
  'accesskey',
  'card',
  'cvv',
  'cvc',
  'iban',
  'bankaccount',
  'email',
  'phone'
];

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(
    0,
    MAX_STRING_LENGTH
  )}...[truncated]`;
}

function normalizeKey(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key) {
  const normalizedKey =
    normalizeKey(key);

  return SENSITIVE_KEY_PARTS.some(
    (sensitivePart) =>
      normalizedKey.includes(
        sensitivePart
      )
  );
}

function serializeError(error) {
  if (!(error instanceof Error)) {
    return {
      name: 'UnknownError',
      message:
        truncateString(
          String(error)
        )
    };
  }

  return {
    name:
      error.name || 'Error',

    message:
      truncateString(
        error.message ||
          'Unknown error'
      ),

    stack:
      error.stack
        ? truncateString(
            error.stack
          )
        : null,

    cause:
      error.cause
        ? truncateString(
            String(error.cause)
          )
        : null
  };
}

function normalizeLogValue(
  value,
  depth = 0,
  seenObjects = new WeakSet()
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_NESTING_DEPTH) {
    return '[maximum depth reached]';
  }

  if (Array.isArray(value)) {
    const normalizedItems =
      value
        .slice(
          0,
          MAX_ARRAY_ITEMS
        )
        .map((item) =>
          normalizeLogValue(
            item,
            depth + 1,
            seenObjects
          )
        );

    if (
      value.length >
      MAX_ARRAY_ITEMS
    ) {
      normalizedItems.push(
        `[${value.length - MAX_ARRAY_ITEMS} additional items omitted]`
      );
    }

    return normalizedItems;
  }

  if (typeof value === 'object') {
    if (seenObjects.has(value)) {
      return '[circular reference]';
    }

    seenObjects.add(value);

    const normalizedObject = {};

    const entries =
      Object.entries(value).slice(
        0,
        MAX_OBJECT_KEYS
      );

    for (
      const [key, nestedValue] of
      entries
    ) {
      normalizedObject[key] =
        isSensitiveKey(key)
          ? '[redacted]'
          : normalizeLogValue(
              nestedValue,
              depth + 1,
              seenObjects
            );
    }

    const objectKeyCount =
      Object.keys(value).length;

    if (
      objectKeyCount >
      MAX_OBJECT_KEYS
    ) {
      normalizedObject
        .omittedKeyCount =
        objectKeyCount -
        MAX_OBJECT_KEYS;
    }

    return normalizedObject;
  }

  return truncateString(
    String(value)
  );
}

function normalizeEventName(event) {
  const normalizedEvent =
    typeof event === 'string'
      ? event.trim()
      : '';

  return normalizedEvent
    ? truncateString(normalizedEvent)
    : 'unknown_event';
}

function writeStructuredLog({
  level,
  event,
  error = null,
  context = {}
}) {
  const payload = {
    timestamp:
      new Date().toISOString(),

    level,

    event:
      normalizeEventName(event),

    environment:
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      'unknown',

    context:
      normalizeLogValue(context)
  };

  if (error !== null) {
    payload.error =
      serializeError(error);
  }

  const serializedPayload =
    JSON.stringify(payload);

  if (level === 'error') {
    console.error(serializedPayload);
    return;
  }

  if (level === 'warn') {
    console.warn(serializedPayload);
    return;
  }

  console.log(serializedPayload);
}

export function createRequestId(
  request
) {
  const incomingRequestId =
    request?.headers?.get?.(
      'x-request-id'
    ) ||
    request?.headers?.get?.(
      'x-vercel-id'
    );

  if (
    typeof incomingRequestId ===
      'string' &&
    incomingRequestId.trim() &&
    incomingRequestId.length <= 200
  ) {
    return incomingRequestId.trim();
  }

  return randomUUID();
}

export function logInfo(
  event,
  context = {}
) {
  writeStructuredLog({
    level: 'info',
    event,
    context
  });
}

export function logWarning(
  event,
  context = {}
) {
  writeStructuredLog({
    level: 'warn',
    event,
    context
  });
}

export function logError(
  event,
  error,
  context = {}
) {
  writeStructuredLog({
    level: 'error',
    event,
    error,
    context
  });
}