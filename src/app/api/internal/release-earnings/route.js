import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import {
  createClient as createSupabaseAdminClient,
} from "@supabase/supabase-js";

import {
  createRequestId,
  logError,
  logInfo,
  logWarning,
} from "@/lib/serverLogger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCronSecret() {
  const cronSecret =
    process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error(
      "CRON_SECRET is missing."
    );
  }

  return cronSecret;
}

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      "Supabase URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }

  return createSupabaseAdminClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function createJsonResponse(
  body,
  {
    status,
    requestId,
  }
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",

        "X-Request-Id":
          requestId,
      },
    }
  );
}

function getBearerToken(request) {
  const authorizationHeader =
    request.headers.get(
      "authorization"
    );

  if (
    !authorizationHeader ||
    !authorizationHeader.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    authorizationHeader
      .slice("Bearer ".length)
      .trim();

  return token || null;
}

function safelyCompareSecrets(
  providedSecret,
  expectedSecret
) {
  if (
    typeof providedSecret !==
      "string" ||
    typeof expectedSecret !==
      "string"
  ) {
    return false;
  }

  const providedBuffer =
    Buffer.from(providedSecret);

  const expectedBuffer =
    Buffer.from(expectedSecret);

  if (
    providedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    providedBuffer,
    expectedBuffer
  );
}

function isAuthorized(request) {
  const providedSecret =
    getBearerToken(request);

  const expectedSecret =
    getCronSecret();

  return safelyCompareSecrets(
    providedSecret,
    expectedSecret
  );
}

async function releaseMaturedEarnings() {
  const supabaseAdmin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabaseAdmin.rpc(
    "release_matured_producer_earnings"
  );

  if (error) {
    throw new Error(
      "Matured producer earnings could not be released.",
      {
        cause:
          error,
      }
    );
  }

  const releasedCount =
    Number(data || 0);

  if (
    !Number.isSafeInteger(
      releasedCount
    ) ||
    releasedCount < 0
  ) {
    throw new Error(
      "The producer earnings release result is invalid."
    );
  }

  return releasedCount;
}

export async function GET(request) {
  const requestId =
    createRequestId(request);

  try {
    if (!isAuthorized(request)) {
      logWarning(
        "earnings_release_unauthorized",
        {
          requestId,
          method:
            request.method,
        }
      );

      return createJsonResponse(
        {
          success: false,

          error:
            "Unauthorized earnings release request.",

          requestId,
        },
        {
          status: 401,
          requestId,
        }
      );
    }

    const releasedCount =
      await releaseMaturedEarnings();

    const completedAt =
      new Date().toISOString();

    logInfo(
      "earnings_release_completed",
      {
        requestId,
        releasedCount,
        completedAt,
      }
    );

    return createJsonResponse(
      {
        success: true,

        earnings: {
          released:
            releasedCount,
        },

        completedAt,
        requestId,
      },
      {
        status: 200,
        requestId,
      }
    );
  } catch (error) {
    logError(
      "earnings_release_failed",
      error,
      {
        requestId,
        method:
          request.method,
      }
    );

    return createJsonResponse(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error during earnings release.",

        requestId,
      },
      {
        status: 500,
        requestId,
      }
    );
  }
}