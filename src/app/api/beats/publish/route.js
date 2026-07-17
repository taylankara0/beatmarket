import {
  HeadObjectCommand
} from "@aws-sdk/client-s3";

import {
  createClient as createSupabaseAdminClient
} from "@supabase/supabase-js";

import {
  createServerClient
} from "@supabase/ssr";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { r2Client } from "@/lib/r2";

export const runtime = "nodejs";

const MEGABYTE = 1024 * 1024;

const MAX_TITLE_LENGTH = 120;
const MAX_PRICE = 1000000;

const MIN_BPM = 1;
const MAX_BPM = 400;

const UPLOAD_POLICIES = {
  preview: {
    maximumBytes:
      25 * MEGABYTE,

    allowedFormats: [
      "MP3"
    ]
  },

  master: {
    maximumBytes:
      250 * MEGABYTE,

    allowedFormats: [
      "MP3",
      "WAV",
      "FLAC"
    ]
  }
};

const AUDIO_FORMATS = {
  MP3: {
    extensions: [
      ".mp3"
    ],

    contentTypes: [
      "audio/mpeg",
      "audio/mp3"
    ]
  },

  WAV: {
    extensions: [
      ".wav"
    ],

    contentTypes: [
      "audio/wav",
      "audio/x-wav",
      "audio/wave",
      "audio/vnd.wave"
    ]
  },

  FLAC: {
    extensions: [
      ".flac"
    ],

    contentTypes: [
      "audio/flac",
      "audio/x-flac"
    ]
  }
};

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

async function getSupabaseAuthClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."
    );
  }

  const cookieStore =
    await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            /*
              Authentication can still be read when cookies
              cannot be updated in this request context.
            */
          }
        }
      }
    }
  );
}

function normalizePrice(value) {
  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue
    ) ||
    numericValue <= 0 ||
    numericValue > MAX_PRICE
  ) {
    return null;
  }

  return numericValue.toFixed(2);
}

function normalizeBpm(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      valid: true,
      value: null
    };
  }

  const numericValue =
    Number(value);

  if (
    !Number.isInteger(
      numericValue
    ) ||
    numericValue < MIN_BPM ||
    numericValue > MAX_BPM
  ) {
    return {
      valid: false,
      value: null
    };
  }

  return {
    valid: true,
    value: numericValue
  };
}

function normalizeContentType(
  contentType
) {
  return String(
    contentType || ""
  )
    .toLowerCase()
    .split(";")[0]
    .trim();
}

function getExtension(objectKey) {
  if (
    typeof objectKey !==
    "string"
  ) {
    return "";
  }

  const filename =
    objectKey
      .split("/")
      .pop() || "";

  const dotIndex =
    filename.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return filename
    .slice(dotIndex)
    .toLowerCase();
}

function determineAudioFormat(
  objectKey,
  contentType
) {
  const extension =
    getExtension(objectKey);

  const normalizedContentType =
    normalizeContentType(
      contentType
    );

  /*
    Both the extension and stored Content-Type must match
    the same supported audio format.

    This prevents a renamed file such as audio.wav being
    accepted merely because it was submitted as audio/mpeg.
  */
  for (
    const [
      format,
      formatPolicy
    ] of Object.entries(
      AUDIO_FORMATS
    )
  ) {
    const extensionMatches =
      formatPolicy.extensions.includes(
        extension
      );

    const contentTypeMatches =
      formatPolicy.contentTypes.includes(
        normalizedContentType
      );

    if (
      extensionMatches &&
      contentTypeMatches
    ) {
      return format;
    }
  }

  return null;
}

function isStorageKeyForUserAndRole({
  objectKey,
  userId,
  uploadType
}) {
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
  if (segments.length < 6) {
    return false;
  }

  const [
    rootDirectory,
    storedUserId,
    year,
    month,
    storedUploadType
  ] = segments;

  if (
    rootDirectory !==
      "masters" ||
    storedUserId !==
      String(userId) ||
    storedUploadType !==
      uploadType
  ) {
    return false;
  }

  if (!/^\d{4}$/.test(year)) {
    return false;
  }

  if (
    !/^(0[1-9]|1[0-2])$/.test(
      month
    )
  ) {
    return false;
  }

  return true;
}

function parseExpectedBytes(value) {
  const numericValue =
    Number(value);

  if (
    !Number.isSafeInteger(
      numericValue
    ) ||
    numericValue <= 0
  ) {
    return null;
  }

  return numericValue;
}

async function inspectR2Object(
  objectKey
) {
  const bucketName =
    process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    throw new Error(
      "R2_BUCKET_NAME is missing."
    );
  }

  const response =
    await r2Client.send(
      new HeadObjectCommand({
        Bucket:
          bucketName,

        Key:
          objectKey
      })
    );

  const metadata =
    response.Metadata || {};

  return {
    contentType:
      response.ContentType ||
      null,

    contentLength:
      Number(
        response.ContentLength ||
        0
      ),

    owner:
      metadata.owner ||
      null,

    uploadType:
      metadata.uploadtype ||
      null,

    expectedBytes:
      parseExpectedBytes(
        metadata.expectedbytes
      )
  };
}

function validateStoredR2Object({
  objectKey,
  objectInformation,
  expectedUserId,
  expectedUploadType
}) {
  const uploadPolicy =
    UPLOAD_POLICIES[
      expectedUploadType
    ];

  if (!uploadPolicy) {
    throw new Error(
      "The expected upload type is invalid."
    );
  }

  if (
    !isStorageKeyForUserAndRole({
      objectKey,
      userId:
        expectedUserId,
      uploadType:
        expectedUploadType
    })
  ) {
    throw new Error(
      `The ${expectedUploadType} storage key is invalid.`
    );
  }

  /*
    New uploads must contain ownership metadata created by
    the authenticated upload endpoint.
  */
  if (
    !objectInformation.owner ||
    String(
      objectInformation.owner
    ) !==
      String(expectedUserId)
  ) {
    throw new Error(
      `The ${expectedUploadType} file ownership metadata is invalid.`
    );
  }

  /*
    Prevent a master URL from being submitted as a preview
    or a preview URL from being submitted as a master.
  */
  if (
    objectInformation.uploadType !==
      expectedUploadType
  ) {
    throw new Error(
      `The stored file is not authorized as a ${expectedUploadType} upload.`
    );
  }

  const actualBytes =
    objectInformation.contentLength;

  if (
    !Number.isSafeInteger(
      actualBytes
    ) ||
    actualBytes <= 0
  ) {
    throw new Error(
      `The ${expectedUploadType} file is empty or has an invalid size.`
    );
  }

  if (
    actualBytes >
    uploadPolicy.maximumBytes
  ) {
    const maximumMegabytes =
      Math.round(
        uploadPolicy.maximumBytes /
          MEGABYTE
      );

    throw new Error(
      `The ${expectedUploadType} file exceeds the ${maximumMegabytes} MB limit.`
    );
  }

  /*
    Compare the actual R2 object size with the exact byte
    count stored when its signed PUT URL was created.
  */
  if (
    objectInformation
      .expectedBytes === null
  ) {
    throw new Error(
      `The ${expectedUploadType} file is missing its expected-size metadata.`
    );
  }

  if (
    actualBytes !==
    objectInformation.expectedBytes
  ) {
    throw new Error(
      `The actual ${expectedUploadType} file size does not match its authorized size.`
    );
  }

  const audioFormat =
    determineAudioFormat(
      objectKey,
      objectInformation.contentType
    );

  if (
    !audioFormat ||
    !uploadPolicy.allowedFormats.includes(
      audioFormat
    )
  ) {
    if (
      expectedUploadType ===
      "preview"
    ) {
      throw new Error(
        "The streaming preview must be a valid MP3 file."
      );
    }

    throw new Error(
      "The master track must be a valid MP3, WAV, or FLAC file."
    );
  }

  return {
    format:
      audioFormat,

    actualBytes
  };
}

export async function POST(request) {
  try {
    const supabaseAuth =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError
    } =
      await supabaseAuth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      console.error(
        "Beat publishing authentication error:",
        authError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "You must be signed in before publishing a beat."
        },
        {
          status: 401
        }
      );
    }

    const requestBody =
      await request.json();

    const title =
      typeof requestBody?.title ===
        "string"
        ? requestBody.title.trim()
        : "";

    const previewKey =
      requestBody?.previewKey;

    const masterKey =
      requestBody?.masterKey;

    const basicPrice =
      normalizePrice(
        requestBody?.basicPrice
      );

    const exclusivePrice =
      normalizePrice(
        requestBody
          ?.exclusivePrice
      );

    const bpmResult =
      normalizeBpm(
        requestBody?.bpm
      );

    if (
      !title ||
      title.length >
        MAX_TITLE_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `Beat title must contain between 1 and ${MAX_TITLE_LENGTH} characters.`
        },
        {
          status: 400
        }
      );
    }

    if (!bpmResult.valid) {
      return NextResponse.json(
        {
          success: false,

          error:
            `BPM must be a whole number between ${MIN_BPM} and ${MAX_BPM}.`
        },
        {
          status: 400
        }
      );
    }

    if (!basicPrice) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The Basic license price is invalid."
        },
        {
          status: 400
        }
      );
    }

    if (!exclusivePrice) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The Exclusive license price is invalid."
        },
        {
          status: 400
        }
      );
    }

    if (
      Number(exclusivePrice) <=
      Number(basicPrice)
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The Exclusive license price must be greater than the Basic license price."
        },
        {
          status: 400
        }
      );
    }

    if (
      typeof previewKey !==
        "string" ||
      typeof masterKey !==
        "string"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The preview or master storage key is missing."
        },
        {
          status: 400
        }
      );
    }

    if (
      previewKey === masterKey
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The preview and master tracks must be different files."
        },
        {
          status: 400
        }
      );
    }

    if (
      !isStorageKeyForUserAndRole({
        objectKey:
          previewKey,

        userId:
          user.id,

        uploadType:
          "preview"
      }) ||
      !isStorageKeyForUserAndRole({
        objectKey:
          masterKey,

        userId:
          user.id,

        uploadType:
          "master"
      })
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "One or more uploaded files do not belong to your account or have an invalid upload role."
        },
        {
          status: 403
        }
      );
    }

    let previewObjectInformation;
    let masterObjectInformation;

    try {
      [
        previewObjectInformation,
        masterObjectInformation
      ] = await Promise.all([
        inspectR2Object(
          previewKey
        ),

        inspectR2Object(
          masterKey
        )
      ]);
    } catch (storageError) {
      console.error(
        "R2 object inspection error:",
        storageError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "One or more uploaded audio files could not be found in private storage."
        },
        {
          status: 400
        }
      );
    }

    let previewValidation;
    let masterValidation;

    try {
      previewValidation =
        validateStoredR2Object({
          objectKey:
            previewKey,

          objectInformation:
            previewObjectInformation,

          expectedUserId:
            user.id,

          expectedUploadType:
            "preview"
        });

      masterValidation =
        validateStoredR2Object({
          objectKey:
            masterKey,

          objectInformation:
            masterObjectInformation,

          expectedUserId:
            user.id,

          expectedUploadType:
            "master"
        });
    } catch (validationError) {
      console.error(
        "Stored R2 object validation error:",
        validationError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            validationError instanceof
            Error
              ? validationError.message
              : "One or more stored audio files are invalid."
        },
        {
          status: 400
        }
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    /*
      producer_id comes only from the authenticated
      server-side Supabase session.
    */
    const {
      data: createdBeat,
      error: beatInsertError
    } = await supabaseAdmin
      .from("beats")
      .insert({
        title,

        bpm:
          bpmResult.value,

        preview_url:
          previewKey,

        untagged_file_key:
          masterKey,

        producer_id:
          user.id,

        is_sold_exclusive:
          false
      })
      .select("id")
      .single();

    if (
      beatInsertError ||
      !createdBeat
    ) {
      console.error(
        "Secure beat creation error:",
        beatInsertError
      );

      throw new Error(
        "The beat could not be saved."
      );
    }

    /*
      License names, exclusivity flags, and file formats are
      decided by the server rather than the browser.
    */
    const {
      error: licensesInsertError
    } = await supabaseAdmin
      .from("licenses")
      .insert([
        {
          beat_id:
            createdBeat.id,

          name:
            "Basic",

          price:
            basicPrice,

          file_format:
            previewValidation
              .format,

          is_exclusive:
            false
        },
        {
          beat_id:
            createdBeat.id,

          name:
            "Exclusive",

          price:
            exclusivePrice,

          file_format:
            masterValidation
              .format,

          is_exclusive:
            true
        }
      ]);

    if (licensesInsertError) {
      console.error(
        "Secure license creation error:",
        licensesInsertError
      );

      const {
        error: cleanupError
      } = await supabaseAdmin
        .from("beats")
        .delete()
        .eq(
          "id",
          createdBeat.id
        );

      if (cleanupError) {
        console.error(
          "Incomplete beat cleanup error:",
          cleanupError
        );
      }

      throw new Error(
        "The beat licenses could not be saved."
      );
    }

    return NextResponse.json(
      {
        success: true,

        beatId:
          createdBeat.id,

        storedFiles: {
          preview: {
            format:
              previewValidation
                .format,

            bytes:
              previewValidation
                .actualBytes
          },

          master: {
            format:
              masterValidation
                .format,

            bytes:
              masterValidation
                .actualBytes
          }
        }
      },
      {
        status: 201
      }
    );
  } catch (error) {
    console.error(
      "Secure beat publishing error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error while publishing the beat."
      },
      {
        status: 500
      }
    );
  }
}