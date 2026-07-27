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

const SCHEDULED_JOB_NAME =
  "release_matured_earnings";

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

function getSafeErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Internal Server Error during earnings release.";
}

async function recordScheduledJobRun({
  requestId,
  status,
  startedAt,
  completedAt,
  durationMs,
  summary,
  errorMessage = null,
}) {
  try {
    const supabaseAdmin =
      getSupabaseAdmin();

    const {
      error,
    } = await supabaseAdmin
      .from("scheduled_job_runs")
      .insert({
        job_name:
          SCHEDULED_JOB_NAME,

        request_id:
          requestId,

        status,

        started_at:
          startedAt,

        completed_at:
          completedAt,

        duration_ms:
          durationMs,

        summary,

        error_message:
          errorMessage,
      });

    if (error) {
      throw new Error(
        "The scheduled job run could not be recorded.",
        {
          cause:
            error,
        }
      );
    }

    return true;
  } catch (error) {
    logError(
      "scheduled_job_run_record_failed",
      error,
      {
        requestId,
        jobName:
          SCHEDULED_JOB_NAME,
        status,
      }
    );

    /*
      Monitoring persistence must not change the result
      of the earnings-release operation itself.
    */
    return false;
  }
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

  const startedAtDate =
    new Date();

  const startedAt =
    startedAtDate.toISOString();

  let authorizedRequest =
    false;

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

    authorizedRequest =
      true;

    const releasedCount =
      await releaseMaturedEarnings();

    const completedAtDate =
      new Date();

    const completedAt =
      completedAtDate.toISOString();

    const durationMs =
      Math.max(
        0,
        completedAtDate.getTime() -
          startedAtDate.getTime()
      );

    const historyRecorded =
      await recordScheduledJobRun({
        requestId,
        status:
          "succeeded",
        startedAt,
        completedAt,
        durationMs,
        summary: {
          releasedCount,
        },
      });

    logInfo(
      "earnings_release_completed",
      {
        requestId,
        releasedCount,
        completedAt,
        durationMs,
        historyRecorded,
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
    const completedAtDate =
      new Date();

    const completedAt =
      completedAtDate.toISOString();

    const durationMs =
      Math.max(
        0,
        completedAtDate.getTime() -
          startedAtDate.getTime()
      );

    const errorMessage =
      getSafeErrorMessage(error);

    let historyRecorded =
      false;

    /*
      Unauthorized public requests are not written to the
      scheduled-job history table.
    */
    if (authorizedRequest) {
      historyRecorded =
        await recordScheduledJobRun({
          requestId,
          status:
            "failed",
          startedAt,
          completedAt,
          durationMs,
          summary: {},
          errorMessage,
        });
    }

    logError(
      "earnings_release_failed",
      error,
      {
        requestId,
        method:
          request.method,
        completedAt,
        durationMs,
        historyRecorded,
      }
    );

    return createJsonResponse(
      {
        success: false,

        error:
          errorMessage,

        requestId,
      },
      {
        status: 500,
        requestId,
      }
    );
  }
}