Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pgDumpPath =
  "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"

$pgRestorePath =
  "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"

$backupDirectory =
  "D:\Masaüstü\BeatMarket-Backups"

$databaseHost =
  "aws-0-eu-central-1.pooler.supabase.com"

$databasePort =
  "5432"

$databaseUser =
  "postgres.tyrsaufezujqlytlgzla"

$databaseName =
  "postgres"

$timestamp =
  Get-Date -Format "yyyyMMdd-HHmmss"

$backupFile =
  Join-Path `
    $backupDirectory `
    "$timestamp-public.backup"

$checksumFile =
  "$backupFile.sha256"

if (-not (Test-Path $pgDumpPath)) {
  throw "pg_dump was not found at: $pgDumpPath"
}

if (-not (Test-Path $pgRestorePath)) {
  throw "pg_restore was not found at: $pgRestorePath"
}

New-Item `
  -ItemType Directory `
  -Path $backupDirectory `
  -Force |
  Out-Null

Write-Output "Creating BeatMarket public database backup..."
Write-Output "Enter the Supabase database password when prompted."

& $pgDumpPath `
  --host $databaseHost `
  --port $databasePort `
  --username $databaseUser `
  --dbname $databaseName `
  --schema "public" `
  --format "custom" `
  --no-owner `
  --no-privileges `
  --file $backupFile `
  --password

if ($LASTEXITCODE -ne 0) {
  Remove-Item `
    -Path $backupFile `
    -ErrorAction SilentlyContinue

  throw "The database backup failed."
}

$backupItem =
  Get-Item $backupFile

if ($backupItem.Length -le 0) {
  Remove-Item `
    -Path $backupFile `
    -ErrorAction SilentlyContinue

  throw "The database backup file is empty."
}

$archiveEntries =
  & $pgRestorePath `
    --list `
    $backupFile

if ($LASTEXITCODE -ne 0) {
  throw "The backup archive could not be validated."
}

$hash =
  (
    Get-FileHash `
      -Path $backupFile `
      -Algorithm SHA256
  ).Hash

"$hash  $($backupItem.Name)" |
  Set-Content `
    -Path $checksumFile `
    -Encoding ascii

Write-Output ""
Write-Output "BACKUP_SUCCESSFUL"
Write-Output "BACKUP_FILE=$backupFile"
Write-Output "CHECKSUM_FILE=$checksumFile"
Write-Output "BACKUP_SIZE_BYTES=$($backupItem.Length)"
Write-Output "ARCHIVE_ENTRIES=$($archiveEntries.Count)"
Write-Output "SHA256=$hash"