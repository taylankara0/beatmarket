import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  Readable,
  Transform,
} from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const requiredEnvironmentVariables = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

for (
  const variableName of
  requiredEnvironmentVariables
) {
  const value =
    process.env[variableName]?.trim();

  if (!value) {
    throw new Error(
      `${variableName} is missing.`
    );
  }
}

const accountId =
  process.env.R2_ACCOUNT_ID.trim();

const accessKeyId =
  process.env.R2_ACCESS_KEY_ID.trim();

const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY.trim();

const bucketName =
  process.env.R2_BUCKET_NAME.trim();

const endpoint =
  `https://${accountId}.r2.cloudflarestorage.com`;

const r2Client = new S3Client({
  region: "auto",

  endpoint,

  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const backupRoot =
  process.env.R2_BACKUP_DIRECTORY?.trim() ||
  path.resolve(
    process.cwd(),
    "..",
    "BeatMarket-R2-Backups"
  );

const timestamp =
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const safeBucketName =
  bucketName.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

const backupDirectory =
  path.join(
    backupRoot,
    `${timestamp}-${safeBucketName}`
  );

const objectsDirectory =
  path.join(
    backupDirectory,
    "objects"
  );

const manifestPath =
  path.join(
    backupDirectory,
    "manifest.json"
  );

const checksumPath =
  path.join(
    backupDirectory,
    "manifest.json.sha256"
  );

function convertDateToText(value) {
  if (!(value instanceof Date)) {
    return null;
  }

  return value.toISOString();
}

function createObjectFilename(key) {
  const keyHash =
    createHash("sha256")
      .update(
        key,
        "utf8"
      )
      .digest("hex");

  return `${keyHash}.object`;
}

function convertBodyToReadable(body) {
  if (body instanceof Readable) {
    return body;
  }

  if (
    body &&
    typeof body.transformToWebStream ===
      "function"
  ) {
    return Readable.fromWeb(
      body.transformToWebStream()
    );
  }

  if (
    body &&
    typeof body.getReader === "function"
  ) {
    return Readable.fromWeb(body);
  }

  throw new Error(
    "R2 returned an unsupported response body."
  );
}

async function listAllObjects() {
  const objects = [];

  let continuationToken;

  do {
    const response =
      await r2Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,

          ContinuationToken:
            continuationToken,
        })
      );

    for (
      const object of
      response.Contents || []
    ) {
      if (
        typeof object.Key === "string"
      ) {
        objects.push(object);
      }
    }

    if (!response.IsTruncated) {
      continuationToken = undefined;
      continue;
    }

    continuationToken =
      response.NextContinuationToken;

    if (!continuationToken) {
      throw new Error(
        "R2 did not return the next pagination token."
      );
    }
  } while (continuationToken);

  return objects;
}

async function downloadObject({
  object,
  currentNumber,
  totalNumber,
}) {
  const key = object.Key;

  if (!key) {
    throw new Error(
      "An R2 object is missing its key."
    );
  }

  console.log(
    `Downloading object ${currentNumber} of ${totalNumber}...`
  );

  const headResponse =
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

  const getResponse =
    await r2Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

  if (!getResponse.Body) {
    throw new Error(
      `R2 returned an empty response body for: ${key}`
    );
  }

  const localFilename =
    createObjectFilename(key);

  const localRelativePath =
    path.posix.join(
      "objects",
      localFilename
    );

  const localAbsolutePath =
    path.join(
      objectsDirectory,
      localFilename
    );

  const contentHash =
    createHash("sha256");

  let downloadedBytes = 0;

  const checksumStream =
    new Transform({
      transform(
        chunk,
        encoding,
        callback
      ) {
        const buffer =
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(
                chunk,
                encoding
              );

        downloadedBytes +=
          buffer.length;

        contentHash.update(buffer);

        callback(
          null,
          buffer
        );
      },
    });

  await pipeline(
    convertBodyToReadable(
      getResponse.Body
    ),

    checksumStream,

    createWriteStream(
      localAbsolutePath,
      {
        flags: "wx",
      }
    )
  );

  const downloadedFile =
    await stat(localAbsolutePath);

  if (
    downloadedFile.size !==
    downloadedBytes
  ) {
    throw new Error(
      `The saved file size does not match the downloaded size for: ${key}`
    );
  }

  if (
    typeof headResponse.ContentLength ===
      "number" &&
    headResponse.ContentLength !==
      downloadedBytes
  ) {
    throw new Error(
      `The downloaded size does not match R2 for: ${key}`
    );
  }

  if (
    typeof object.Size === "number" &&
    object.Size !== downloadedBytes
  ) {
    throw new Error(
      `The downloaded size does not match the R2 object listing for: ${key}`
    );
  }

  return {
    key,

    localFile:
      localRelativePath,

    sizeBytes:
      downloadedBytes,

    sha256:
      contentHash
        .digest("hex")
        .toUpperCase(),

    etag:
      headResponse.ETag ||
      object.ETag ||
      null,

    lastModified:
      convertDateToText(
        object.LastModified
      ),

    contentType:
      headResponse.ContentType ||
      null,

    contentDisposition:
      headResponse.ContentDisposition ||
      null,

    contentEncoding:
      headResponse.ContentEncoding ||
      null,

    contentLanguage:
      headResponse.ContentLanguage ||
      null,

    cacheControl:
      headResponse.CacheControl ||
      null,

    expires:
      convertDateToText(
        headResponse.Expires
      ),

    metadata:
      headResponse.Metadata || {},

    storageClass:
      headResponse.StorageClass ||
      object.StorageClass ||
      null,
  };
}

async function createBackup() {
  await mkdir(
    objectsDirectory,
    {
      recursive: true,
    }
  );

  console.log(
    "Reading the R2 object list..."
  );

  const listedObjects =
    await listAllObjects();

  console.log(
    `Objects found: ${listedObjects.length}`
  );

  const manifestObjects = [];

  let totalBytes = 0;

  for (
    let index = 0;
    index < listedObjects.length;
    index += 1
  ) {
    const manifestObject =
      await downloadObject({
        object:
          listedObjects[index],

        currentNumber:
          index + 1,

        totalNumber:
          listedObjects.length,
      });

    manifestObjects.push(
      manifestObject
    );

    totalBytes +=
      manifestObject.sizeBytes;
  }

  const manifest = {
    format:
      "beatmarket-r2-backup",

    formatVersion:
      1,

    createdAt:
      new Date().toISOString(),

    bucket:
      bucketName,

    objectCount:
      manifestObjects.length,

    totalBytes,

    objects:
      manifestObjects,
  };

  const manifestText =
    `${JSON.stringify(
      manifest,
      null,
      2
    )}\n`;

  await writeFile(
    manifestPath,
    manifestText,
    "utf8"
  );

  const manifestChecksum =
    createHash("sha256")
      .update(
        manifestText,
        "utf8"
      )
      .digest("hex")
      .toUpperCase();

  await writeFile(
    checksumPath,

    `${manifestChecksum}  manifest.json\r\n`,

    "ascii"
  );

  console.log("");
  console.log(
    "R2_BACKUP_SUCCESSFUL"
  );

  console.log(
    `BACKUP_DIRECTORY=${backupDirectory}`
  );

  console.log(
    `OBJECT_COUNT=${manifestObjects.length}`
  );

  console.log(
    `TOTAL_BYTES=${totalBytes}`
  );

  console.log(
    `MANIFEST_SHA256=${manifestChecksum}`
  );
}

try {
  await createBackup();
} catch (error) {
  await rm(
    backupDirectory,
    {
      recursive: true,
      force: true,
    }
  ).catch(() => {});

  console.error("");
  console.error(
    "R2_BACKUP_FAILED"
  );

  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
}