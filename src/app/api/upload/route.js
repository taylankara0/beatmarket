import { randomUUID } from "crypto";
import {
  createClient as createSupabaseAdminClient,
} from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  consumeApiRateLimit,
} from "@/lib/apiRateLimit";
import { r2Client } from "@/lib/r2";

export const runtime = "nodejs";

const MEGABYTE = 1024 * 1024;
const UPLOAD_RATE_LIMIT_MAX_REQUESTS = 20;
const UPLOAD_RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_UPLOAD_AUTH_REQUEST_BODY_BYTES = 16 * 1024;

const UPLOAD_POLICIES = {
  preview: {
    maximumBytes: 25 * MEGABYTE,

    allowedFileTypes: {
      "audio/mpeg": [".mp3"],
      "audio/mp3": [".mp3"],
    },
  },

  master: {
    maximumBytes: 250 * MEGABYTE,

    allowedFileTypes: {
      "audio/mpeg": [".mp3"],
      "audio/mp3": [".mp3"],
      "audio/wav": [".wav"],
      "audio/x-wav": [".wav"],
      "audio/wave": [".wav"],
      "audio/vnd.wave": [".wav"],
      "audio/flac": [".flac"],
      "audio/x-flac": [".flac"],
    },
  },
};

const MAX_FILENAME_LENGTH = 180;

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
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

async function getSupabaseAuthClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."
    );
  }

  const cookieStore = await cookies();

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
                options,
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
              The authenticated session can still be read
              when cookies cannot be updated.
            */
          }
        },
      },
    }
  );
}

function createJsonResponse(
  body,
  init = {}
) {
  const headers =
    new Headers(init.headers);

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return NextResponse.json(
    body,
    {
      ...init,
      headers,
    }
  );
}

async function readJsonBodyWithLimit(
  request
) {
  const contentTypeHeader =
    request.headers.get(
      "content-type"
    );

  if (
    contentTypeHeader &&
    normalizeContentType(
      contentTypeHeader
    ) !== "application/json"
  ) {
    return {
      success: false,
      status: 415,
      error:
        "The upload authorization request must use application/json.",
    };
  }

  const contentLengthHeader =
    request.headers.get(
      "content-length"
    );

  if (contentLengthHeader) {
    const normalizedContentLength =
      contentLengthHeader.trim();

    if (
      !/^\d+$/.test(
        normalizedContentLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          "The upload authorization request body length is invalid.",
      };
    }

    const declaredContentLength =
      Number(
        normalizedContentLength
      );

    if (
      !Number.isSafeInteger(
        declaredContentLength
      )
    ) {
      return {
        success: false,
        status: 400,
        error:
          "The upload authorization request body length is invalid.",
      };
    }

    if (
      declaredContentLength >
      MAX_UPLOAD_AUTH_REQUEST_BODY_BYTES
    ) {
      return {
        success: false,
        status: 413,
        error:
          "The upload authorization request body is too large.",
      };
    }
  }

  if (!request.body) {
    return {
      success: false,
      status: 400,
      error:
        "The upload authorization request body is invalid.",
    };
  }

  const reader =
    request.body.getReader();

  const decoder =
    new TextDecoder(
      "utf-8",
      {
        fatal: true,
      }
    );

  let totalBytes = 0;
  let bodyText = "";

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      totalBytes +=
        value.byteLength;

      if (
        totalBytes >
        MAX_UPLOAD_AUTH_REQUEST_BODY_BYTES
      ) {
        try {
          await reader.cancel();
        } catch {
          /*
            The request is already being rejected, so a
            cancellation error does not change the response.
          */
        }

        return {
          success: false,
          status: 413,
          error:
            "The upload authorization request body is too large.",
        };
      }

      bodyText += decoder.decode(
        value,
        {
          stream: true,
        }
      );
    }

    bodyText += decoder.decode();
  } catch {
    return {
      success: false,
      status: 400,
      error:
        "The upload authorization request body is invalid.",
    };
  }

  if (!bodyText.trim()) {
    return {
      success: false,
      status: 400,
      error:
        "The upload authorization request body is invalid.",
    };
  }

  try {
    return {
      success: true,
      body:
        JSON.parse(bodyText),
    };
  } catch {
    return {
      success: false,
      status: 400,
      error:
        "The upload authorization request body is invalid.",
    };
  }
}

function normalizeContentType(contentType) {
  if (typeof contentType !== "string") {
    return "";
  }

  return contentType
    .toLowerCase()
    .split(";")[0]
    .trim();
}

function getSafeFilename(filename) {
  if (typeof filename !== "string") {
    return null;
  }

  /*
    Remove directory components so filenames such as
    ../../secret.mp3 cannot affect the R2 object path.
  */
  const baseFilename = filename
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.trim();

  if (!baseFilename) {
    return null;
  }

  const sanitizedFilename = baseFilename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, MAX_FILENAME_LENGTH);

  if (
    !sanitizedFilename ||
    !sanitizedFilename.includes(".")
  ) {
    return null;
  }

  return sanitizedFilename;
}

function getFileExtension(filename) {
  const lastDotIndex =
    filename.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return filename
    .slice(lastDotIndex)
    .toLowerCase();
}

function isAllowedAudioFile({
  filename,
  contentType,
  uploadType,
}) {
  const uploadPolicy =
    UPLOAD_POLICIES[uploadType];

  if (!uploadPolicy) {
    return false;
  }

  const allowedExtensions =
    uploadPolicy.allowedFileTypes[
      contentType
    ];

  if (!allowedExtensions) {
    return false;
  }

  const extension =
    getFileExtension(filename);

  return allowedExtensions.includes(
    extension
  );
}

function createStorageKey({
  userId,
  uploadType,
  filename,
}) {
  const currentDate =
    new Date();

  const year =
    currentDate
      .getUTCFullYear()
      .toString();

  const month =
    String(
      currentDate.getUTCMonth() + 1
    ).padStart(2, "0");

  return [
    "masters",
    userId,
    year,
    month,
    uploadType,
    `${randomUUID()}-${filename}`,
  ].join("/");
}

function formatMegabytes(bytes) {
  return Math.round(
    bytes / MEGABYTE
  );
}

export async function POST(request) {
  try {
    const supabase =
      await getSupabaseAuthClient();

    const {
      data: { user },
      error: authError,
    } =
      await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        "Upload authentication error:",
        authError
      );

      return createJsonResponse(
        {
          success: false,
          error:
            "You must be signed in before uploading a beat.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("is_producer")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Upload producer authorization error:",
        profileError
      );

      return createJsonResponse(
        {
          success: false,
          error:
            "Your producer permissions could not be verified.",
        },
        {
          status: 500,
        }
      );
    }

    if (!profile?.is_producer) {
      return createJsonResponse(
        {
          success: false,
          error:
            "Only producer accounts can upload beats.",
        },
        {
          status: 403,
        }
      );
    }

    const supabaseAdmin =
      getSupabaseAdmin();

    const rateLimitResult =
      await consumeApiRateLimit({
        supabaseAdmin,
        rateKey:
          `upload:user:${user.id}`,
        maxRequests:
          UPLOAD_RATE_LIMIT_MAX_REQUESTS,
        windowSeconds:
          UPLOAD_RATE_LIMIT_WINDOW_SECONDS,
      });

    if (!rateLimitResult.allowed) {
      return createJsonResponse(
        {
          success: false,
          error:
            "Too many upload authorization requests. Please wait before trying again.",
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.max(
                1,
                rateLimitResult.retryAfterSeconds
              )
            ),
          },
        }
      );
    }

    const requestBodyResult =
      await readJsonBodyWithLimit(
        request
      );

    if (!requestBodyResult.success) {
      return createJsonResponse(
        {
          success: false,
          error:
            requestBodyResult.error,
        },
        {
          status:
            requestBodyResult.status,
        }
      );
    }

    const requestBody =
      requestBodyResult.body;

    const filename =
      requestBody?.filename;

    const contentType =
      normalizeContentType(
        requestBody?.contentType
      );

    const uploadType =
      requestBody?.uploadType;

    const fileSize =
      Number(
        requestBody?.fileSize
      );

    if (
      typeof filename !== "string" ||
      !contentType ||
      typeof uploadType !== "string" ||
      !Number.isSafeInteger(fileSize)
    ) {
      return createJsonResponse(
        {
          success: false,
          error:
            "Missing or invalid filename, contentType, uploadType, or fileSize parameter.",
        },
        {
          status: 400,
        }
      );
    }

    const uploadPolicy =
      UPLOAD_POLICIES[uploadType];

    if (!uploadPolicy) {
      return createJsonResponse(
        {
          success: false,
          error:
            'uploadType must be either "preview" or "master".',
        },
        {
          status: 400,
        }
      );
    }

    if (fileSize <= 0) {
      return createJsonResponse(
        {
          success: false,
          error:
            "The selected audio file is empty.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      fileSize >
      uploadPolicy.maximumBytes
    ) {
      const maximumMegabytes =
        formatMegabytes(
          uploadPolicy.maximumBytes
        );

      return createJsonResponse(
        {
          success: false,
          error:
            `The ${uploadType} file cannot exceed ${maximumMegabytes} MB.`,
        },
        {
          status: 413,
        }
      );
    }

    const safeFilename =
      getSafeFilename(filename);

    if (!safeFilename) {
      return createJsonResponse(
        {
          success: false,
          error:
            "The uploaded file has an invalid filename.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isAllowedAudioFile({
        filename:
          safeFilename,

        contentType,

        uploadType,
      })
    ) {
      const errorMessage =
        uploadType === "preview"
          ? "The preview track must be an MP3 file."
          : "The master track must be an MP3, WAV, or FLAC file.";

      return createJsonResponse(
        {
          success: false,
          error:
            errorMessage,
        },
        {
          status: 400,
        }
      );
    }

    const bucketName =
      process.env.R2_BUCKET_NAME;

    if (!bucketName) {
      throw new Error(
        "R2_BUCKET_NAME is missing."
      );
    }

    const uniqueKey =
      createStorageKey({
        userId:
          user.id,

        uploadType,

        filename:
          safeFilename,
      });

    /*
      These metadata values are included in the signed PUT
      request and must also be sent by the browser.
    */
    const objectMetadata = {
      owner:
        user.id,

      originalfilename:
        safeFilename,

      uploadtype:
        uploadType,

      expectedbytes:
        String(fileSize),
    };

    /*
      Return the exact headers the browser must include when
      performing the direct PUT request to R2.
    */
    const uploadHeaders = {
      "Content-Type":
        contentType,

      "x-amz-meta-owner":
        objectMetadata.owner,

      "x-amz-meta-originalfilename":
        objectMetadata.originalfilename,

      "x-amz-meta-uploadtype":
        objectMetadata.uploadtype,

      "x-amz-meta-expectedbytes":
        objectMetadata.expectedbytes,
    };

    const command =
      new PutObjectCommand({
        Bucket:
          bucketName,

        Key:
          uniqueKey,

        ContentType:
          contentType,

        ContentLength:
          fileSize,

        Metadata:
          objectMetadata,
      });

    /*
      Keep the metadata values as signed request headers
      rather than moving them into the URL query string.
    */
    const uploadUrl =
      await getSignedUrl(
        r2Client,
        command,
        {
          expiresIn: 60,

          unhoistableHeaders:
            new Set([
              "x-amz-meta-owner",
              "x-amz-meta-originalfilename",
              "x-amz-meta-uploadtype",
              "x-amz-meta-expectedbytes",
            ]),

          signableHeaders:
            new Set([
              "content-type",
            ]),
        }
      );

    return createJsonResponse({
      success: true,

      uploadUrl,

      uploadHeaders,

      fileKey:
        uniqueKey,

      uploadType,

      maximumBytes:
        uploadPolicy.maximumBytes,
    });
  } catch (error) {
    console.error(
      "Presigned URL generation error:",
      error
    );

    return createJsonResponse(
      {
        success: false,
        error:
          "Internal Server Error during upload authorization.",
      },
      {
        status: 500,
      }
    );
  }
}