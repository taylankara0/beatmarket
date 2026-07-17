import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import {
  createClient as createSupabaseAdminClient,
} from "@supabase/supabase-js";

import { r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPORARY_PREFIX = "temporary/";
const MAX_HEAD_CONCURRENCY = 10;
const DELETE_BATCH_SIZE = 1000;

/*
  Temporary objects normally contain an expiresat metadata
  value. Objects missing that metadata are deleted only when
  they are older than this fallback period.
*/
const FALLBACK_EXPIRATION_HOURS = 48;

function getBucketName() {
  const bucketName =
    process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    throw new Error(
      "R2_BUCKET_NAME is missing."
    );
  }

  return bucketName;
}

function getCleanupSecret() {
  const cleanupSecret =
    process.env.CRON_SECRET;

  if (!cleanupSecret) {
    throw new Error(
      "CRON_SECRET is missing."
    );
  }

  return cleanupSecret;
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
    getCleanupSecret();

  return safelyCompareSecrets(
    providedSecret,
    expectedSecret
  );
}

function parseIsoDate(value) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function isFallbackExpired(
  lastModified,
  currentTime
) {
  if (!(lastModified instanceof Date)) {
    return false;
  }

  const fallbackExpirationTime =
    lastModified.getTime() +
    FALLBACK_EXPIRATION_HOURS *
      60 *
      60 *
      1000;

  return (
    fallbackExpirationTime <=
    currentTime
  );
}

async function listTemporaryObjects() {
  const bucketName =
    getBucketName();

  const objects = [];
  let continuationToken;

  do {
    const response =
      await r2Client.send(
        new ListObjectsV2Command({
          Bucket:
            bucketName,

          Prefix:
            TEMPORARY_PREFIX,

          ContinuationToken:
            continuationToken,
        })
      );

    for (
      const object of
      response.Contents || []
    ) {
      if (!object.Key) {
        continue;
      }

      objects.push({
        key:
          object.Key,

        lastModified:
          object.LastModified ||
          null,

        size:
          Number(
            object.Size || 0
          ),
      });
    }

    continuationToken =
      response.IsTruncated
        ? response
            .NextContinuationToken
        : undefined;
  } while (continuationToken);

  return objects;
}

async function inspectTemporaryObject(
  object
) {
  const bucketName =
    getBucketName();

  try {
    const response =
      await r2Client.send(
        new HeadObjectCommand({
          Bucket:
            bucketName,

          Key:
            object.key,
        })
      );

    const metadata =
      response.Metadata || {};

    return {
      ...object,

      expiresAt:
        parseIsoDate(
          metadata.expiresat
        ),

      uploadState:
        metadata.uploadstate ||
        null,

      headError:
        null,
    };
  } catch (error) {
    return {
      ...object,

      expiresAt:
        null,

      uploadState:
        null,

      headError:
        error,
    };
  }
}

async function inspectObjectsInBatches(
  objects
) {
  const inspectedObjects = [];

  for (
    let index = 0;
    index < objects.length;
    index += MAX_HEAD_CONCURRENCY
  ) {
    const batch =
      objects.slice(
        index,
        index +
          MAX_HEAD_CONCURRENCY
      );

    const batchResults =
      await Promise.all(
        batch.map(
          inspectTemporaryObject
        )
      );

    inspectedObjects.push(
      ...batchResults
    );
  }

  return inspectedObjects;
}

function selectExpiredObjects(
  inspectedObjects
) {
  const currentTime =
    Date.now();

  const expiredObjects = [];
  const skippedObjects = [];
  const failedObjects = [];

  for (
    const object of
    inspectedObjects
  ) {
    if (object.headError) {
      failedObjects.push({
        key:
          object.key,

        reason:
          object.headError instanceof
          Error
            ? object.headError.message
            : "Object inspection failed.",
      });

      continue;
    }

    if (
      object.expiresAt &&
      object.expiresAt.getTime() <=
        currentTime
    ) {
      expiredObjects.push(
        object
      );

      continue;
    }

    /*
      Only temporary-state objects are eligible for the
      LastModified fallback cleanup.
    */
    if (
      !object.expiresAt &&
      object.uploadState ===
        "temporary" &&
      isFallbackExpired(
        object.lastModified,
        currentTime
      )
    ) {
      expiredObjects.push(
        object
      );

      continue;
    }

    skippedObjects.push(
      object
    );
  }

  return {
    expiredObjects,
    skippedObjects,
    failedObjects,
  };
}

async function deleteExpiredObjects(
  expiredObjects
) {
  const bucketName =
    getBucketName();

  const deletedKeys = [];
  const deletionErrors = [];

  for (
    let index = 0;
    index < expiredObjects.length;
    index += DELETE_BATCH_SIZE
  ) {
    const batch =
      expiredObjects.slice(
        index,
        index +
          DELETE_BATCH_SIZE
      );

    const response =
      await r2Client.send(
        new DeleteObjectsCommand({
          Bucket:
            bucketName,

          Delete: {
            Quiet:
              false,

            Objects:
              batch.map(
                (object) => ({
                  Key:
                    object.key,
                })
              ),
          },
        })
      );

    for (
      const deletedObject of
      response.Deleted || []
    ) {
      if (deletedObject.Key) {
        deletedKeys.push(
          deletedObject.Key
        );
      }
    }

    for (
      const deletionError of
      response.Errors || []
    ) {
      deletionErrors.push({
        key:
          deletionError.Key ||
          null,

        code:
          deletionError.Code ||
          null,

        message:
          deletionError.Message ||
          "R2 deletion failed.",
      });
    }
  }

  return {
    deletedKeys,
    deletionErrors,
  };
}

async function runTemporaryUploadCleanup() {
  const listedObjects =
    await listTemporaryObjects();

  const inspectedObjects =
    await inspectObjectsInBatches(
      listedObjects
    );

  const {
    expiredObjects,
    skippedObjects,
    failedObjects,
  } =
    selectExpiredObjects(
      inspectedObjects
    );

  const {
    deletedKeys,
    deletionErrors,
  } =
    await deleteExpiredObjects(
      expiredObjects
    );

  const deletedKeySet =
    new Set(deletedKeys);

  const deletedBytes =
    expiredObjects
      .filter((object) =>
        deletedKeySet.has(
          object.key
        )
      )
      .reduce(
        (
          total,
          object
        ) =>
          total +
          Math.max(
            0,
            object.size
          ),
        0
      );

  return {
    scanned:
      listedObjects.length,

    expired:
      expiredObjects.length,

    deleted:
      deletedKeys.length,

    deletedBytes,

    retained:
      skippedObjects.length,

    inspectionFailures:
      failedObjects,

    deletionFailures:
      deletionErrors,
  };
}

async function runCheckoutStateCleanup() {
  const supabaseAdmin =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabaseAdmin
    .rpc(
      "cleanup_safe_checkout_state"
    )
    .single();

  if (error) {
    console.error(
      "Checkout state cleanup RPC error:",
      error
    );

    throw new Error(
      "Expired checkout state could not be cleaned up."
    );
  }

  return {
    expiredInitializingOrders:
      Number(
        data
          ?.expired_initializing_orders ||
          0
      ),

    releasedInitializingReservations:
      Number(
        data
          ?.released_initializing_reservations ||
          0
      ),

    releasedFailedReservations:
      Number(
        data
          ?.released_failed_reservations ||
          0
      ),
  };
}

function hasUploadCleanupFailures(
  uploadCleanupResult
) {
  return (
    uploadCleanupResult
      .inspectionFailures
      .length > 0 ||
    uploadCleanupResult
      .deletionFailures
      .length > 0
  );
}

export async function GET(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Unauthorized cleanup request.",
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

    /*
      The two cleanup operations are independent, so they can
      run at the same time during one protected cron request.
    */
    const [
      temporaryUploadCleanup,
      checkoutStateCleanup,
    ] = await Promise.all([
      runTemporaryUploadCleanup(),
      runCheckoutStateCleanup(),
    ]);

    const success =
      !hasUploadCleanupFailures(
        temporaryUploadCleanup
      );

    return NextResponse.json(
      {
        success,

        cleanup: {
          temporaryUploads:
            temporaryUploadCleanup,

          checkoutState:
            checkoutStateCleanup,
        },

        completedAt:
          new Date()
            .toISOString(),
      },
      {
        status:
          success
            ? 200
            : 207,

        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Protected cleanup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error during protected cleanup.",
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