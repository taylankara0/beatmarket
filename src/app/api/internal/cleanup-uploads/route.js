import {
  DeleteObjectsCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";

import {
  timingSafeEqual
} from "crypto";

import {
  NextResponse
} from "next/server";

import {
  createClient as createSupabaseAdminClient
} from "@supabase/supabase-js";

import {
  r2Client
} from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGED_UPLOAD_PREFIX =
  "masters/";

const DELETE_BATCH_SIZE =
  1000;

const DATABASE_PAGE_SIZE =
  1000;

/*
  Recently uploaded files are not deleted immediately.

  This gives producers enough time to finish publishing
  a beat after uploading its files.
*/
const ORPHAN_MINIMUM_AGE_HOURS =
  48;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        persistSession: false
      }
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
      .slice(
        "Bearer ".length
      )
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
    Buffer.from(
      providedSecret
    );

  const expectedBuffer =
    Buffer.from(
      expectedSecret
    );

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

function isManagedUploadKey(
  objectKey
) {
  if (
    typeof objectKey !==
      "string" ||
    !objectKey.trim()
  ) {
    return false;
  }

  const segments =
    objectKey.split("/");

  /*
    The secured upload endpoint creates keys using:

    masters/{userId}/{year}/{month}/{uploadType}/{filename}
  */
  if (segments.length !== 6) {
    return false;
  }

  const [
    rootDirectory,
    userId,
    year,
    month,
    uploadType,
    filename
  ] = segments;

  if (
    rootDirectory !==
      "masters" ||
    !UUID_PATTERN.test(
      userId
    ) ||
    !/^\d{4}$/.test(
      year
    ) ||
    !/^(0[1-9]|1[0-2])$/.test(
      month
    ) ||
    ![
      "preview",
      "master"
    ].includes(
      uploadType
    ) ||
    !filename
  ) {
    return false;
  }

  return true;
}

function isOldEnoughForCleanup(
  lastModified,
  currentTime
) {
  if (
    !(lastModified instanceof Date)
  ) {
    return false;
  }

  const minimumAgeMilliseconds =
    ORPHAN_MINIMUM_AGE_HOURS *
    60 *
    60 *
    1000;

  return (
    lastModified.getTime() +
      minimumAgeMilliseconds <=
    currentTime
  );
}

async function listManagedUploadObjects() {
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
            MANAGED_UPLOAD_PREFIX,

          ContinuationToken:
            continuationToken
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
          )
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

function addReferencedKey(
  referencedKeys,
  value
) {
  if (
    typeof value !==
      "string"
  ) {
    return;
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    return;
  }

  referencedKeys.add(
    normalizedValue
  );
}

async function getReferencedStorageKeys() {
  const supabaseAdmin =
    getSupabaseAdmin();

  const referencedKeys =
    new Set();

  let startIndex = 0;

  while (true) {
    const endIndex =
      startIndex +
      DATABASE_PAGE_SIZE -
      1;

    const {
      data: beats,
      error
    } = await supabaseAdmin
      .from("beats")
      .select(`
        preview_url,
        tagged_file_key,
        untagged_file_key,
        stems_file_key,
        cover_art_key
      `)
      .range(
        startIndex,
        endIndex
      );

    if (error) {
      console.error(
        "Referenced upload lookup error:",
        error
      );

      throw new Error(
        "Published beat files could not be checked before cleanup."
      );
    }

    for (
      const beat of beats || []
    ) {
      addReferencedKey(
        referencedKeys,
        beat.preview_url
      );

      addReferencedKey(
        referencedKeys,
        beat.tagged_file_key
      );

      addReferencedKey(
        referencedKeys,
        beat.untagged_file_key
      );

      addReferencedKey(
        referencedKeys,
        beat.stems_file_key
      );

      addReferencedKey(
        referencedKeys,
        beat.cover_art_key
      );
    }

    if (
      !beats ||
      beats.length <
        DATABASE_PAGE_SIZE
    ) {
      break;
    }

    startIndex +=
      DATABASE_PAGE_SIZE;
  }

  return referencedKeys;
}

function selectOrphanCandidates({
  listedObjects,
  referencedKeys
}) {
  const currentTime =
    Date.now();

  const orphanCandidates = [];
  const referencedObjects = [];
  const recentObjects = [];
  const unmanagedObjects = [];

  for (
    const object of
    listedObjects
  ) {
    if (
      !isManagedUploadKey(
        object.key
      )
    ) {
      unmanagedObjects.push(
        object
      );

      continue;
    }

    if (
      referencedKeys.has(
        object.key
      )
    ) {
      referencedObjects.push(
        object
      );

      continue;
    }

    if (
      !isOldEnoughForCleanup(
        object.lastModified,
        currentTime
      )
    ) {
      recentObjects.push(
        object
      );

      continue;
    }

    orphanCandidates.push(
      object
    );
  }

  return {
    orphanCandidates,
    referencedObjects,
    recentObjects,
    unmanagedObjects
  };
}

async function deleteOrphanObjects(
  orphanObjects
) {
  const bucketName =
    getBucketName();

  const deletedKeys = [];
  const deletionErrors = [];

  for (
    let index = 0;
    index < orphanObjects.length;
    index += DELETE_BATCH_SIZE
  ) {
    const batch =
      orphanObjects.slice(
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
                    object.key
                })
              )
          }
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
          "R2 deletion failed."
      });
    }
  }

  return {
    deletedKeys,
    deletionErrors
  };
}

async function runUploadCleanup() {
  /*
    Load R2 objects and database references independently
    so the two operations can run at the same time.
  */
  const [
    listedObjects,
    initialReferencedKeys
  ] = await Promise.all([
    listManagedUploadObjects(),
    getReferencedStorageKeys()
  ]);

  const {
    orphanCandidates,
    referencedObjects,
    recentObjects,
    unmanagedObjects
  } = selectOrphanCandidates({
    listedObjects,
    referencedKeys:
      initialReferencedKeys
  });

  /*
    Refresh the database references immediately before
    deletion.

    This reduces the chance of deleting a file that became
    associated with a newly published beat during cleanup.
  */
  const finalReferencedKeys =
    orphanCandidates.length > 0
      ? await getReferencedStorageKeys()
      : initialReferencedKeys;

  const safeOrphanObjects =
    orphanCandidates.filter(
      (object) =>
        !finalReferencedKeys.has(
          object.key
        )
    );

  const newlyReferencedObjects =
    orphanCandidates.filter(
      (object) =>
        finalReferencedKeys.has(
          object.key
        )
    );

  const {
    deletedKeys,
    deletionErrors
  } = await deleteOrphanObjects(
    safeOrphanObjects
  );

  const deletedKeySet =
    new Set(
      deletedKeys
    );

  const deletedBytes =
    safeOrphanObjects
      .filter(
        (object) =>
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

    referenced:
      referencedObjects.length +
      newlyReferencedObjects.length,

    recentUnreferenced:
      recentObjects.length,

    unmanaged:
      unmanagedObjects.length,

    orphanCandidates:
      safeOrphanObjects.length,

    deleted:
      deletedKeys.length,

    deletedBytes,

    retained:
      referencedObjects.length +
      newlyReferencedObjects.length +
      recentObjects.length +
      unmanagedObjects.length,

    deletionFailures:
      deletionErrors
  };
}

async function runCheckoutStateCleanup() {
  const supabaseAdmin =
    getSupabaseAdmin();

  const {
    data,
    error
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
      )
  };
}

function hasUploadCleanupFailures(
  uploadCleanupResult
) {
  return (
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
            "Unauthorized cleanup request."
        },
        {
          status: 401,

          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }

    /*
      Upload cleanup and checkout-state cleanup are
      independent, so they can run at the same time.
    */
    const [
      uploadCleanup,
      checkoutStateCleanup
    ] = await Promise.all([
      runUploadCleanup(),
      runCheckoutStateCleanup()
    ]);

    const success =
      !hasUploadCleanupFailures(
        uploadCleanup
      );

    return NextResponse.json(
      {
        success,

        cleanup: {
          temporaryUploads:
            uploadCleanup,

          checkoutState:
            checkoutStateCleanup
        },

        completedAt:
          new Date()
            .toISOString()
      },
      {
        status:
          success
            ? 200
            : 207,

        headers: {
          "Cache-Control":
            "no-store"
        }
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
            : "Internal Server Error during protected cleanup."
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store"
        }
      }
    );
  }
}