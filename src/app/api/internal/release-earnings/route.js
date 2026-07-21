import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import {
  createClient as createSupabaseAdminClient,
} from "@supabase/supabase-js";

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
    console.error(
      "Producer earnings release RPC error:",
      error
    );

    throw new Error(
      "Matured producer earnings could not be released."
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
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized earnings release request.",
        },
        {
          status: 401,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const releasedCount =
      await releaseMaturedEarnings();

    return NextResponse.json(
      {
        success: true,

        earnings: {
          released:
            releasedCount,
        },

        completedAt:
          new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Protected earnings release error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error during earnings release.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}