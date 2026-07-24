import 'server-only';

export async function consumeApiRateLimit({
  supabaseAdmin,
  rateKey,
  maxRequests,
  windowSeconds
}) {
  if (!supabaseAdmin) {
    throw new Error(
      'A Supabase admin client is required for rate limiting.'
    );
  }

  const { data, error } =
    await supabaseAdmin.rpc(
      'consume_api_rate_limit',
      {
        target_rate_key: rateKey,
        target_max_requests:
          maxRequests,
        target_window_seconds:
          windowSeconds
      }
    );

  if (error) {
    console.error(
      'API rate-limit check error:',
      error
    );

    throw new Error(
      'The API rate limit could not be checked.'
    );
  }

  const result = Array.isArray(data)
    ? data[0]
    : data;

  if (
    !result ||
    typeof result.allowed !== 'boolean'
  ) {
    throw new Error(
      'The API rate-limit response is invalid.'
    );
  }

  return {
    allowed: result.allowed,

    remaining: Number.isFinite(
      Number(result.remaining)
    )
      ? Math.max(
          0,
          Number(result.remaining)
        )
      : 0,

    retryAfterSeconds:
      Number.isFinite(
        Number(
          result.retry_after_seconds
        )
      )
        ? Math.max(
            0,
            Number(
              result.retry_after_seconds
            )
          )
        : 0
  };
}