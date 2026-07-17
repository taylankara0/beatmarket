import { randomUUID } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { r2Client } from "@/lib/r2";

export const runtime = "nodejs";

const MEGABYTE = 1024 * 1024;

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

      return NextResponse.json(
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

    const requestBody =
      await request.json();

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
      return NextResponse.json(
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
      return NextResponse.json(
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
      return NextResponse.json(
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

      return NextResponse.json(
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
      return NextResponse.json(
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

      return NextResponse.json(
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

    return NextResponse.json({
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

    return NextResponse.json(
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