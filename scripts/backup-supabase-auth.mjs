import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  createClient,
} from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL?.trim() ||
  process.env
    .NEXT_PUBLIC_SUPABASE_URL
    ?.trim();

const serviceRoleKey =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY
    ?.trim();

if (!supabaseUrl) {
  throw new Error(
    [
      "SUPABASE_URL is missing.",
      "NEXT_PUBLIC_SUPABASE_URL may also be used as a fallback.",
    ].join(" ")
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing."
  );
}

let parsedSupabaseUrl;

try {
  parsedSupabaseUrl =
    new URL(supabaseUrl);
} catch {
  throw new Error(
    "The configured Supabase URL is invalid."
  );
}

if (
  parsedSupabaseUrl.protocol !==
  "https:"
) {
  throw new Error(
    "The Supabase URL must use HTTPS."
  );
}

const projectReference =
  parsedSupabaseUrl.hostname
    .split(".")[0]
    ?.trim();

if (!projectReference) {
  throw new Error(
    "The Supabase project reference could not be determined."
  );
}

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );

const backupRoot =
  process.env
    .SUPABASE_AUTH_BACKUP_DIRECTORY
    ?.trim() ||
  path.resolve(
    process.cwd(),
    "..",
    "BeatMarket-Auth-Backups"
  );

const timestamp =
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(
      /\.\d{3}Z$/,
      "Z"
    );

const backupDirectory =
  path.join(
    backupRoot,
    `${timestamp}-${projectReference}`
  );

const backupFile =
  path.join(
    backupDirectory,
    "auth-users.json"
  );

const checksumFile =
  path.join(
    backupDirectory,
    "auth-users.json.sha256"
  );

const pageSize = 1000;
const maximumPages = 10000;

function createSha256(
  value
) {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .toUpperCase();
}

function normalizeUser(
  user
) {
  return {
    id:
      user.id,

    aud:
      user.aud || null,

    role:
      user.role || null,

    email:
      user.email || null,

    phone:
      user.phone || null,

    emailConfirmedAt:
      user.email_confirmed_at ||
      null,

    phoneConfirmedAt:
      user.phone_confirmed_at ||
      null,

    confirmedAt:
      user.confirmed_at ||
      null,

    invitedAt:
      user.invited_at ||
      null,

    confirmationSentAt:
      user.confirmation_sent_at ||
      null,

    recoverySentAt:
      user.recovery_sent_at ||
      null,

    emailChangeSentAt:
      user.email_change_sent_at ||
      null,

    newEmail:
      user.new_email || null,

    newPhone:
      user.new_phone || null,

    lastSignInAt:
      user.last_sign_in_at ||
      null,

    createdAt:
      user.created_at || null,

    updatedAt:
      user.updated_at || null,

    bannedUntil:
      user.banned_until || null,

    deletedAt:
      user.deleted_at || null,

    isAnonymous:
      user.is_anonymous === true,

    appMetadata:
      user.app_metadata &&
      typeof user.app_metadata ===
        "object"
        ? user.app_metadata
        : {},

    userMetadata:
      user.user_metadata &&
      typeof user.user_metadata ===
        "object"
        ? user.user_metadata
        : {},

    identities:
      Array.isArray(
        user.identities
      )
        ? user.identities
        : [],

    factors:
      Array.isArray(
        user.factors
      )
        ? user.factors
        : [],
  };
}

async function listAllUsers() {
  const users = [];

  let page = 1;

  while (page <= maximumPages) {
    console.log(
      `Reading Supabase Auth users page ${page}...`
    );

    const {
      data,
      error,
    } =
      await supabase
        .auth
        .admin
        .listUsers({
          page,
          perPage:
            pageSize,
        });

    if (error) {
      throw new Error(
        `Supabase Auth user retrieval failed: ${error.message}`
      );
    }

    const pageUsers =
      Array.isArray(
        data?.users
      )
        ? data.users
        : [];

    users.push(
      ...pageUsers
    );

    if (
      pageUsers.length <
      pageSize
    ) {
      break;
    }

    const returnedNextPage =
      Number(
        data?.nextPage
      );

    if (
      Number.isSafeInteger(
        returnedNextPage
      ) &&
      returnedNextPage > page
    ) {
      page =
        returnedNextPage;
    } else {
      page += 1;
    }
  }

  if (
    page >
    maximumPages
  ) {
    throw new Error(
      "The Supabase Auth pagination safety limit was reached."
    );
  }

  return users;
}

function validateUsers(
  users
) {
  const seenUserIds =
    new Set();

  for (
    const user of users
  ) {
    if (
      !user ||
      typeof user.id !==
        "string" ||
      !user.id.trim()
    ) {
      throw new Error(
        "Supabase returned a user with an invalid ID."
      );
    }

    if (
      seenUserIds.has(
        user.id
      )
    ) {
      throw new Error(
        `Supabase returned a duplicate user ID: ${user.id}`
      );
    }

    seenUserIds.add(
      user.id
    );
  }
}

async function createBackup() {
  await mkdir(
    backupDirectory,
    {
      recursive: true,
    }
  );

  const users =
    await listAllUsers();

  validateUsers(users);

  const normalizedUsers =
    users
      .map(
        normalizeUser
      )
      .sort(
        (
          firstUser,
          secondUser
        ) =>
          firstUser.id.localeCompare(
            secondUser.id
          )
      );

  const backup = {
    format:
      "beatmarket-supabase-auth-backup",

    formatVersion:
      1,

    createdAt:
      new Date().toISOString(),

    projectReference,

    supabaseHost:
      parsedSupabaseUrl.hostname,

    userCount:
      normalizedUsers.length,

    passwordHashesIncluded:
      false,

    recoveryNotice:
      [
        "Supabase Admin API exports do not include password hashes.",
        "A complete Auth recovery may require password-reset emails.",
        "This backup contains sensitive personal and authentication metadata.",
      ],

    users:
      normalizedUsers,
  };

  const backupText =
    `${JSON.stringify(
      backup,
      null,
      2
    )}\n`;

  await writeFile(
    backupFile,
    backupText,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    }
  );

  const savedFile =
    await stat(
      backupFile
    );

  if (
    !savedFile.isFile() ||
    savedFile.size <= 0
  ) {
    throw new Error(
      "The Auth backup file is empty or invalid."
    );
  }

  const savedBackupBuffer =
    await readFile(
      backupFile
    );

  const expectedChecksum =
    createSha256(
      Buffer.from(
        backupText,
        "utf8"
      )
    );

  const savedChecksum =
    createSha256(
      savedBackupBuffer
    );

  if (
    savedChecksum !==
    expectedChecksum
  ) {
    throw new Error(
      "The saved Auth backup checksum does not match the generated content."
    );
  }

  await writeFile(
    checksumFile,

    `${savedChecksum}  auth-users.json\r\n`,

    {
      encoding: "ascii",
      flag: "wx",
      mode: 0o600,
    }
  );

  console.log("");
  console.log(
    "SUPABASE_AUTH_BACKUP_SUCCESSFUL"
  );

  console.log(
    `BACKUP_DIRECTORY=${backupDirectory}`
  );

  console.log(
    `BACKUP_FILE=${backupFile}`
  );

  console.log(
    `CHECKSUM_FILE=${checksumFile}`
  );

  console.log(
    `USER_COUNT=${normalizedUsers.length}`
  );

  console.log(
    `BACKUP_SIZE_BYTES=${savedFile.size}`
  );

  console.log(
    `SHA256=${savedChecksum}`
  );

  console.log(
    "PASSWORD_HASHES_INCLUDED=false"
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
  ).catch(
    () => {}
  );

  console.error("");
  console.error(
    "SUPABASE_AUTH_BACKUP_FAILED"
  );

  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );

  process.exitCode = 1;
}