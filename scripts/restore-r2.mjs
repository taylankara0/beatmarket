import { createHash } from "node:crypto";
import {
  createReadStream,
} from "node:fs";
import {
  readFile,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const argumentsList =
  process.argv.slice(2);

const applyRestore =
  argumentsList.includes("--apply");

const overwriteExisting =
  argumentsList.includes("--overwrite");

const positionalArguments =
  argumentsList.filter(
    (argument) =>
      !argument.startsWith("--")
  );

if (overwriteExisting && !applyRestore) {
  throw new Error(
    "--overwrite can only be used together with --apply."
  );
}

if (positionalArguments.length !== 1) {
  throw new Error(
    [
      "Provide exactly one R2 backup directory.",
      "",
      "Verification only:",
      "node --env-file=.env.local scripts/restore-r2.mjs \"D:\\path\\to\\backup\"",
      "",
      "Restore missing objects:",
      "node --env-file=.env.local scripts/restore-r2.mjs \"D:\\path\\to\\backup\" --apply",
      "",
      "Restore and overwrite existing objects:",
      "node --env-file=.env.local scripts/restore-r2.mjs \"D:\\path\\to\\backup\" --apply --overwrite",
    ].join("\n")
  );
}

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

const backupDirectory =
  path.resolve(
    positionalArguments[0]
  );

const manifestPath =
  path.join(
    backupDirectory,
    "manifest.json"
  );

const manifestChecksumPath =
  path.join(
    backupDirectory,
    "manifest.json.sha256"
  );

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

const r2Client =
  new S3Client({
    region: "auto",

    endpoint,

    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

function calculateBufferSha256(
  buffer
) {
  return createHash("sha256")
    .update(buffer)
    .digest("hex")
    .toUpperCase();
}

async function calculateFileSha256(
  filePath
) {
  const hash =
    createHash("sha256");

  const inputStream =
    createReadStream(filePath);

  for await (
    const chunk of inputStream
  ) {
    hash.update(chunk);
  }

  return hash
    .digest("hex")
    .toUpperCase();
}

function resolveSafeBackupPath(
  relativePath
) {
  if (
    typeof relativePath !== "string" ||
    !relativePath.trim()
  ) {
    throw new Error(
      "A manifest object has an invalid localFile value."
    );
  }

  const resolvedPath =
    path.resolve(
      backupDirectory,
      relativePath
    );

  const normalizedBackupRoot =
    `${backupDirectory}${path.sep}`
      .toLowerCase();

  const normalizedResolvedPath =
    resolvedPath.toLowerCase();

  if (
    normalizedResolvedPath !==
      backupDirectory.toLowerCase() &&
    !normalizedResolvedPath.startsWith(
      normalizedBackupRoot
    )
  ) {
    throw new Error(
      `A manifest path leaves the backup directory: ${relativePath}`
    );
  }

  return resolvedPath;
}

function normalizeMetadata(
  metadata
) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return {};
  }

  const normalized = {};

  for (
    const [key, value] of
    Object.entries(metadata)
  ) {
    if (
      typeof key === "string" &&
      key &&
      typeof value === "string"
    ) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function parseOptionalDate(
  value
) {
  if (
    typeof value !== "string" ||
    !value
  ) {
    return undefined;
  }

  const parsedDate =
    new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    throw new Error(
      `The manifest contains an invalid date: ${value}`
    );
  }

  return parsedDate;
}

function isNotFoundError(
  error
) {
  return (
    error?.$metadata
      ?.httpStatusCode === 404 ||
    error?.name === "NotFound" ||
    error?.Code === "NotFound" ||
    error?.code === "NotFound"
  );
}

async function getExistingObject(
  key
) {
  try {
    const response =
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );

    return {
      exists: true,

      sizeBytes:
        typeof response.ContentLength ===
          "number"
          ? response.ContentLength
          : null,

      metadata:
        response.Metadata || {},
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        exists: false,
        sizeBytes: null,
        metadata: {},
      };
    }

    throw error;
  }
}

async function loadAndValidateManifest() {
  const manifestBuffer =
    await readFile(manifestPath);

  const checksumText =
    await readFile(
      manifestChecksumPath,
      "ascii"
    );

  const expectedManifestChecksum =
    checksumText
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase();

  if (
    !expectedManifestChecksum ||
    !/^[A-F0-9]{64}$/.test(
      expectedManifestChecksum
    )
  ) {
    throw new Error(
      "The manifest checksum file is invalid."
    );
  }

  const actualManifestChecksum =
    calculateBufferSha256(
      manifestBuffer
    );

  if (
    actualManifestChecksum !==
    expectedManifestChecksum
  ) {
    throw new Error(
      "The manifest SHA-256 checksum does not match."
    );
  }

  let manifest;

  try {
    manifest =
      JSON.parse(
        manifestBuffer.toString(
          "utf8"
        )
      );
  } catch {
    throw new Error(
      "manifest.json is not valid JSON."
    );
  }

  if (
    manifest?.format !==
      "beatmarket-r2-backup" ||
    manifest?.formatVersion !== 1
  ) {
    throw new Error(
      "The backup format or version is unsupported."
    );
  }

  if (
    manifest.bucket !== bucketName
  ) {
    throw new Error(
      [
        "The backup bucket does not match R2_BUCKET_NAME.",
        `Backup bucket: ${manifest.bucket}`,
        `Target bucket: ${bucketName}`,
      ].join("\n")
    );
  }

  if (
    !Array.isArray(
      manifest.objects
    )
  ) {
    throw new Error(
      "The manifest objects list is invalid."
    );
  }

  if (
    manifest.objectCount !==
    manifest.objects.length
  ) {
    throw new Error(
      "The manifest object count does not match its object list."
    );
  }

  return {
    manifest,
    manifestChecksum:
      actualManifestChecksum,
  };
}

async function validateBackupObject(
  manifestObject
) {
  if (
    typeof manifestObject?.key !==
      "string" ||
    !manifestObject.key
  ) {
    throw new Error(
      "A manifest object has an invalid R2 key."
    );
  }

  if (
    !Number.isSafeInteger(
      manifestObject.sizeBytes
    ) ||
    manifestObject.sizeBytes < 0
  ) {
    throw new Error(
      `The manifest contains an invalid size for: ${manifestObject.key}`
    );
  }

  if (
    typeof manifestObject.sha256 !==
      "string" ||
    !/^[A-Fa-f0-9]{64}$/.test(
      manifestObject.sha256
    )
  ) {
    throw new Error(
      `The manifest contains an invalid SHA-256 value for: ${manifestObject.key}`
    );
  }

  const localFilePath =
    resolveSafeBackupPath(
      manifestObject.localFile
    );

  const localFile =
    await stat(localFilePath);

  if (!localFile.isFile()) {
    throw new Error(
      `The backup object is not a file: ${manifestObject.localFile}`
    );
  }

  if (
    localFile.size !==
    manifestObject.sizeBytes
  ) {
    throw new Error(
      `The backup file size does not match the manifest for: ${manifestObject.key}`
    );
  }

  const actualFileChecksum =
    await calculateFileSha256(
      localFilePath
    );

  if (
    actualFileChecksum !==
    manifestObject.sha256.toUpperCase()
  ) {
    throw new Error(
      `The backup file SHA-256 checksum does not match for: ${manifestObject.key}`
    );
  }

  return {
    localFilePath,
    actualFileChecksum,
  };
}

async function restoreObject({
  manifestObject,
  localFilePath,
}) {
  const existingObject =
    await getExistingObject(
      manifestObject.key
    );

  if (
    existingObject.exists &&
    !overwriteExisting
  ) {
    return {
      result: "skipped_existing",
      existingSizeBytes:
        existingObject.sizeBytes,
    };
  }

  if (!applyRestore) {
    return {
      result:
        existingObject.exists
          ? "would_overwrite"
          : "would_restore",

      existingSizeBytes:
        existingObject.sizeBytes,
    };
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket:
        bucketName,

      Key:
        manifestObject.key,

      Body:
        createReadStream(
          localFilePath
        ),

      ContentLength:
        manifestObject.sizeBytes,

      ContentType:
        manifestObject.contentType ||
        undefined,

      ContentDisposition:
        manifestObject
          .contentDisposition ||
        undefined,

      ContentEncoding:
        manifestObject
          .contentEncoding ||
        undefined,

      ContentLanguage:
        manifestObject
          .contentLanguage ||
        undefined,

      CacheControl:
        manifestObject.cacheControl ||
        undefined,

      Expires:
        parseOptionalDate(
          manifestObject.expires
        ),

      Metadata:
        normalizeMetadata(
          manifestObject.metadata
        ),
    })
  );

  const restoredObject =
    await getExistingObject(
      manifestObject.key
    );

  if (!restoredObject.exists) {
    throw new Error(
      `The restored object could not be verified: ${manifestObject.key}`
    );
  }

  if (
    restoredObject.sizeBytes !==
    manifestObject.sizeBytes
  ) {
    throw new Error(
      `The restored R2 object size does not match: ${manifestObject.key}`
    );
  }

  return {
    result:
      existingObject.exists
        ? "overwritten"
        : "restored",

    existingSizeBytes:
      existingObject.sizeBytes,
  };
}

async function run() {
  const {
    manifest,
    manifestChecksum,
  } =
    await loadAndValidateManifest();

  const seenKeys =
    new Set();

  const seenLocalFiles =
    new Set();

  let calculatedTotalBytes = 0;

  let verifiedCount = 0;
  let restoredCount = 0;
  let overwrittenCount = 0;
  let skippedExistingCount = 0;
  let wouldRestoreCount = 0;
  let wouldOverwriteCount = 0;

  console.log(
    applyRestore
      ? "R2 restore mode enabled."
      : "R2 verification-only mode enabled."
  );

  console.log(
    `Backup directory: ${backupDirectory}`
  );

  console.log(
    `Target bucket: ${bucketName}`
  );

  console.log(
    `Objects in manifest: ${manifest.objects.length}`
  );

  for (
    let index = 0;
    index < manifest.objects.length;
    index += 1
  ) {
    const manifestObject =
      manifest.objects[index];

    if (
      seenKeys.has(
        manifestObject.key
      )
    ) {
      throw new Error(
        `The manifest contains a duplicate R2 key: ${manifestObject.key}`
      );
    }

    if (
      seenLocalFiles.has(
        manifestObject.localFile
      )
    ) {
      throw new Error(
        `The manifest contains a duplicate local file: ${manifestObject.localFile}`
      );
    }

    seenKeys.add(
      manifestObject.key
    );

    seenLocalFiles.add(
      manifestObject.localFile
    );

    console.log(
      `Verifying object ${index + 1} of ${manifest.objects.length}...`
    );

    const {
      localFilePath,
    } =
      await validateBackupObject(
        manifestObject
      );

    verifiedCount += 1;

    calculatedTotalBytes +=
      manifestObject.sizeBytes;

    const restoreResult =
      await restoreObject({
        manifestObject,
        localFilePath,
      });

    switch (
      restoreResult.result
    ) {
      case "restored":
        restoredCount += 1;
        break;

      case "overwritten":
        overwrittenCount += 1;
        break;

      case "skipped_existing":
        skippedExistingCount += 1;
        break;

      case "would_restore":
        wouldRestoreCount += 1;
        break;

      case "would_overwrite":
        wouldOverwriteCount += 1;
        break;

      default:
        throw new Error(
          `An unknown restore result was returned for: ${manifestObject.key}`
        );
    }
  }

  if (
    calculatedTotalBytes !==
    manifest.totalBytes
  ) {
    throw new Error(
      "The calculated backup size does not match manifest.totalBytes."
    );
  }

  console.log("");
  console.log(
    applyRestore
      ? "R2_RESTORE_SUCCESSFUL"
      : "R2_BACKUP_VERIFICATION_SUCCESSFUL"
  );

  console.log(
    `MANIFEST_SHA256=${manifestChecksum}`
  );

  console.log(
    `VERIFIED_OBJECTS=${verifiedCount}`
  );

  console.log(
    `VERIFIED_BYTES=${calculatedTotalBytes}`
  );

  console.log(
    `RESTORED_OBJECTS=${restoredCount}`
  );

  console.log(
    `OVERWRITTEN_OBJECTS=${overwrittenCount}`
  );

  console.log(
    `SKIPPED_EXISTING_OBJECTS=${skippedExistingCount}`
  );

  console.log(
    `WOULD_RESTORE_OBJECTS=${wouldRestoreCount}`
  );

  console.log(
    `WOULD_OVERWRITE_OBJECTS=${wouldOverwriteCount}`
  );
}

try {
  await run();
} catch (error) {
  console.error("");
  console.error(
    "R2_RESTORE_FAILED"
  );

  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
} finally {
  r2Client.destroy();
}