# BeatMarket Backup and Recovery

This document describes the current backup and recovery procedures for BeatMarket.

The project currently uses:

- Supabase PostgreSQL
- Supabase Auth
- Cloudflare R2 private object storage
- Vercel
- GitHub

## Important limitations

The current backups are stored on the same computer as the local BeatMarket project.

They protect against:

- Accidental record deletion
- Accidental R2 object deletion
- Database corruption
- Application mistakes
- Incorrect migrations

They do not fully protect against:

- Computer loss
- Disk failure
- Theft
- Fire or physical damage
- Ransomware affecting the backup drive

An encrypted off-device backup should be added when trusted external or cloud storage becomes available.

Never commit generated backups to GitHub.

Never commit `.env.local` or service credentials.

---

# Backup locations

## Supabase public database

```text
D:\Masaüstü\BeatMarket-Backups

Each successful backup produces:

YYYYMMDD-HHMMSS-public.backup
YYYYMMDD-HHMMSS-public.backup.sha256
Cloudflare R2
D:\Masaüstü\BeatMarket-R2-Backups

Each successful backup produces a timestamped directory containing:

manifest.json
manifest.json.sha256
objects\

The object files use SHA-256-based local filenames. Their original R2 keys and metadata are preserved in manifest.json.

Supabase Auth
D:\Masaüstü\BeatMarket-Auth-Backups

Each successful backup produces a timestamped directory containing:

auth-users.json
auth-users.json.sha256

This file contains sensitive user and authentication metadata.

Do not share it publicly.

Required local software

The database backup requires PostgreSQL 17 command-line tools.

Expected locations:

C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
C:\Program Files\PostgreSQL\17\bin\pg_restore.exe

The R2 and Supabase Auth scripts require Node.js and the project dependencies.

Required environment variables

The Node.js backup scripts read credentials from:

.env.local

Required Cloudflare R2 variables:

R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME

Required Supabase Auth variables:

SUPABASE_SERVICE_ROLE_KEY

One of the following Supabase URL variables is also required:

SUPABASE_URL
NEXT_PUBLIC_SUPABASE_URL

Do not print or share the contents of .env.local.

1. Supabase public database backup
Script
scripts/backup-supabase-public.ps1
Run

Environment: PowerShell

From:

D:\Masaüstü\BeatMarket

Run:

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\backup-supabase-public.ps1"

The script asks for the current Supabase database password.

The password is entered interactively and is not stored in the script.

Successful result

A successful run prints:

BACKUP_SUCCESSFUL
BACKUP_FILE=...
CHECKSUM_FILE=...
BACKUP_SIZE_BYTES=...
ARCHIVE_ENTRIES=...
SHA256=...

The script:

Creates a PostgreSQL custom-format archive
Backs up the public schema
Excludes ownership information
Excludes privilege statements
Verifies that the file is not empty
Validates the archive with pg_restore --list
Creates a SHA-256 checksum file
Coverage

This backup includes BeatMarket data in the Supabase public schema.

It does not include:

Supabase Auth password hashes
Supabase internal schemas
Cloudflare R2 objects
Vercel settings
GitHub repository data
Manual archive validation

Environment: PowerShell

Replace the path with the backup being checked:

& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" `
  --list `
  "D:\Masaüstü\BeatMarket-Backups\BACKUP_FILE.backup"

A valid archive returns its table-of-contents entries without an error.

Checksum validation

Environment: PowerShell

Run:

Get-FileHash `
  "D:\Masaüstü\BeatMarket-Backups\BACKUP_FILE.backup" `
  -Algorithm SHA256

Compare the returned hash with the matching .sha256 file.

Database recovery warning

Do not restore directly into the live Production database without first testing the archive in an empty recovery database or separate Supabase project.

A database restore can overwrite or conflict with existing Production data.

Before any real restore:

Disable Production writes and payments.
Create a fresh recovery database or separate Supabase project.
Validate the backup checksum.
Review the archive with pg_restore --list.
Restore into the recovery environment.
Test application data and relationships.
Only then plan the Production recovery.
2. Cloudflare R2 backup
Script
scripts/backup-r2.mjs
Run

Environment: PowerShell

From:

D:\Masaüstü\BeatMarket

Run:

node --env-file=.env.local .\scripts\backup-r2.mjs
Successful result

A successful run prints:

R2_BACKUP_SUCCESSFUL
BACKUP_DIRECTORY=...
OBJECT_COUNT=...
TOTAL_BYTES=...
MANIFEST_SHA256=...

The script:

Lists every object in the configured R2 bucket
Handles paginated object listings
Downloads every object
Verifies downloaded byte counts
Calculates a SHA-256 checksum for every object
Preserves original R2 keys
Preserves available object metadata
Creates manifest.json
Creates a SHA-256 checksum for the manifest
Removes the incomplete backup directory if the backup fails
Current verified baseline

The first verified R2 backup contained:

OBJECT_COUNT=26
TOTAL_BYTES=88756160

Its manifest checksum was:

11FCF3BBE0E11BB9C654BEE9C0A5E939BE6B39D2AFDC7D41DCFD3F553667F2C8

This baseline is historical and will change as producers upload or delete beats.

3. Cloudflare R2 verification and restore
Script
scripts/restore-r2.mjs

The script defaults to verification-only mode.

Verification-only mode does not upload, delete, or overwrite R2 objects.

Verify a backup

Environment: PowerShell

Run:

node --env-file=.env.local `
  .\scripts\restore-r2.mjs `
  "D:\Masaüstü\BeatMarket-R2-Backups\BACKUP_DIRECTORY"

A successful verification prints:

R2_BACKUP_VERIFICATION_SUCCESSFUL
MANIFEST_SHA256=...
VERIFIED_OBJECTS=...
VERIFIED_BYTES=...
RESTORED_OBJECTS=0
OVERWRITTEN_OBJECTS=0
SKIPPED_EXISTING_OBJECTS=...
WOULD_RESTORE_OBJECTS=...
WOULD_OVERWRITE_OBJECTS=...

The verification process checks:

Manifest checksum
Backup format
Bucket name
Object count
Duplicate keys
Duplicate local files
Safe local file paths
Every local object size
Every local object SHA-256 checksum
Total backup byte count
Whether each object already exists in R2
Restore only missing objects

Environment: PowerShell

Run only after verification succeeds:

node --env-file=.env.local `
  .\scripts\restore-r2.mjs `
  "D:\Masaüstü\BeatMarket-R2-Backups\BACKUP_DIRECTORY" `
  --apply

This mode:

Restores missing objects
Skips objects that already exist
Does not overwrite existing objects
Overwrite existing objects

Environment: PowerShell

This is the highest-risk mode:

node --env-file=.env.local `
  .\scripts\restore-r2.mjs `
  "D:\Masaüstü\BeatMarket-R2-Backups\BACKUP_DIRECTORY" `
  --apply `
  --overwrite

Use this only when an existing R2 object is known to be corrupted or incorrect.

Before using --overwrite:

Create a new R2 backup.
Verify the new backup.
Confirm the exact target bucket.
Confirm the backup belongs to that bucket.
Disable relevant Production writes when necessary.
Review the manifest.
Restore during a controlled maintenance period.

The restore script does not delete extra objects that are absent from the backup.

4. Supabase Auth backup
Script
scripts/backup-supabase-auth.mjs
Run

Environment: PowerShell

From:

D:\Masaüstü\BeatMarket

Run:

node --env-file=.env.local `
  .\scripts\backup-supabase-auth.mjs
Successful result

A successful run prints:

SUPABASE_AUTH_BACKUP_SUCCESSFUL
BACKUP_DIRECTORY=...
BACKUP_FILE=...
CHECKSUM_FILE=...
USER_COUNT=...
BACKUP_SIZE_BYTES=...
SHA256=...
PASSWORD_HASHES_INCLUDED=false

The script:

Reads users through the Supabase Admin API
Handles pagination
Rejects duplicate or invalid user IDs
Preserves user IDs
Preserves email and phone information
Preserves confirmation timestamps
Preserves account timestamps
Preserves app metadata
Preserves user metadata
Preserves identities
Preserves MFA factor metadata when returned
Sorts users consistently
Creates a SHA-256 checksum
Removes the incomplete backup directory if the backup fails
Current verified baseline

The first verified Auth backup contained:

USER_COUNT=3
BACKUP_SIZE_BYTES=3733
PASSWORD_HASHES_INCLUDED=false

Its checksum was:

EC3FBC5EF59E401225807A18C66ADB577205DD6032D1325C2DAB1593F7CD739A

This baseline is historical and will change as users register or update their accounts.

Auth recovery limitation

The Supabase Admin API does not export password hashes.

Therefore, this backup cannot recreate users with their existing passwords.

A complete Auth recovery may require:

Recreating users with preserved IDs where supported
Recreating identities carefully
Restoring metadata
Sending password-reset emails
Re-enrolling MFA factors
Confirming email ownership again
Testing profile-to-user relationships

No automated Supabase Auth restore script currently exists.

Do not attempt a Production Auth restore without a separate recovery plan and controlled testing.

5. Recommended manual backup routine

Until automated encrypted off-device backups are available, run all three backup procedures:

Before a major database migration
Before changing payment or refund logic
Before changing storage behavior
Before bulk data changes
Before launch
After major Production data changes
At least once per week while Production data is active

Recommended order:

Supabase public database backup
Supabase Auth backup
Cloudflare R2 backup
R2 verification-only check

Keep each backup’s checksum file with its matching backup.

Do not rename individual files inside an R2 backup directory.

Do not modify manifest.json.

6. Recovery order

For a full BeatMarket recovery, use this general order:

Secure the incident and disable Production writes.
Keep payments disabled.
Preserve current logs and damaged data.
Create emergency backups when possible.
Restore the Supabase public database into a recovery environment.
Review Supabase Auth recovery requirements.
Verify and restore missing R2 objects.
Restore environment variables securely.
Deploy the matching Git commit.
Run automated tests.
Run a Production-style smoke test in the recovery environment.
Re-enable Production traffic only after verification.

The correct recovery sequence may change depending on the incident.

7. GitHub and application recovery

Application source code is stored in GitHub:

https://github.com/taylankara0/beatmarket.git

Production branch:

master

After cloning the repository on a replacement computer:

git clone https://github.com/taylankara0/beatmarket.git

Then:

cd beatmarket
npm.cmd install
npm.cmd test
npm.cmd run build

Environment credentials must be restored separately.

Secrets must not be copied from Git history.

8. Vercel recovery

Vercel environment variables must be reviewed separately because the local backup scripts do not back up Vercel configuration.

Important Production variables include:

CRON_SECRET
IYZICO_API_KEY
IYZICO_BASE_URL
IYZICO_SECRET_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
PAYMENT_MODE
R2_ACCESS_KEY_ID
R2_ACCOUNT_ID
R2_BUCKET_NAME
R2_SECRET_ACCESS_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL

Payments currently remain disabled through:

PAYMENT_MODE=disabled

Do not enable payments until valid Iyzico configuration and complete payment smoke testing are finished.

9. Cloudflare R2 security settings

The beatit-tracks bucket must remain private.

Required state:

Public Development URL disabled
No unintended public custom domain
Direct browser uploads restricted by CORS
Production origin explicitly allowed
Local development origin allowed
Only required upload methods and headers allowed

Current upload origins:

http://localhost:3000
https://beatmarket-opal.vercel.app

The Production CORS upload flow was tested successfully after configuration.

10. Security rules

Never:

Commit backup files
Commit .env.local
Commit database passwords
Commit service-role keys
Share Auth backup JSON publicly
Restore directly into Production without testing
Use the R2 overwrite option without a verified reason
Store secrets inside backup scripts
Send credentials through chat or screenshots

After any suspected credential exposure:

Rotate the credential immediately.
Update local environment variables.
Update Vercel environment variables when applicable.
Redeploy when necessary.
Verify that the old credential no longer works.
11. Remaining recovery gaps

The following items are still pending:

Encrypted off-device backup storage
Automated backup scheduling
Supabase Auth restoration procedure
Tested database restoration in a separate recovery project
Full disaster-recovery rehearsal
Documented Vercel environment-variable export process
Final domain and email recovery planning

These gaps do not invalidate the current backups, but they prevent the system from being considered fully disaster-resistant.


Save the file and tell me when it is saved.