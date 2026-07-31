Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$utf8Encoding =
  [System.Text.UTF8Encoding]::new(
    $false
  )

[Console]::InputEncoding =
  $utf8Encoding

[Console]::OutputEncoding =
  $utf8Encoding

$OutputEncoding =
  $utf8Encoding

try {
  & "$env:SystemRoot\System32\chcp.com" `
    65001 |
    Out-Null
} catch {
  # Continue even if the console code page
  # cannot be changed.
}

$projectRoot =
  Split-Path `
    -Parent `
    $PSScriptRoot

$environmentFile =
  Join-Path `
    $projectRoot `
    ".env.local"

$databaseBackupScript =
  Join-Path `
    $PSScriptRoot `
    "backup-supabase-public.ps1"

$authBackupScript =
  Join-Path `
    $PSScriptRoot `
    "backup-supabase-auth.mjs"

$r2BackupScript =
  Join-Path `
    $PSScriptRoot `
    "backup-r2.mjs"

$r2RestoreScript =
  Join-Path `
    $PSScriptRoot `
    "restore-r2.mjs"

$defaultR2BackupRoot =
  Join-Path `
    (
      Split-Path `
        -Parent `
        $projectRoot
    ) `
    "BeatMarket-R2-Backups"

function Assert-FileExists {
  param (
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (
    -not (
      Test-Path `
        -LiteralPath $Path `
        -PathType Leaf
    )
  ) {
    throw (
      "$Description was not found at: $Path"
    )
  }
}

function Invoke-NodeScript {
  param (
    [Parameter(Mandatory = $true)]
    [string]$NodePath,

    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,

    [string[]]$AdditionalArguments = @()
  )

  $nodeArguments = @(
    "--env-file=$environmentFile"
    $ScriptPath
  ) + $AdditionalArguments

  $commandOutput = @(
    & $NodePath `
      @nodeArguments `
      2>&1
  )

  $commandExitCode =
    $LASTEXITCODE

  foreach (
    $outputLine in
    $commandOutput
  ) {
    Write-Host (
      [string]$outputLine
    )
  }

  if (
    $commandExitCode -ne 0
  ) {
    throw (
      "The command failed with exit code " +
      "$commandExitCode`: $ScriptPath"
    )
  }

  return ,$commandOutput
}

function Resolve-R2BackupDirectory {
  param (
    [Parameter(Mandatory = $true)]
    [string]$ReportedPath
  )

  if (
    Test-Path `
      -LiteralPath $ReportedPath `
      -PathType Container
  ) {
    return (
      Get-Item `
        -LiteralPath $ReportedPath
    ).FullName
  }

  $backupDirectoryName =
    Split-Path `
      -Path $ReportedPath `
      -Leaf

  if (
    -not $backupDirectoryName
  ) {
    throw (
      "The R2 backup returned an invalid " +
      "backup directory path."
    )
  }

  $fallbackPath =
    Join-Path `
      $defaultR2BackupRoot `
      $backupDirectoryName

  if (
    Test-Path `
      -LiteralPath $fallbackPath `
      -PathType Container
  ) {
    return (
      Get-Item `
        -LiteralPath $fallbackPath
    ).FullName
  }

  throw (
    "The returned R2 backup directory " +
    "does not exist: $ReportedPath"
  )
}

Assert-FileExists `
  -Path $environmentFile `
  -Description ".env.local"

Assert-FileExists `
  -Path $databaseBackupScript `
  -Description "Supabase public database backup script"

Assert-FileExists `
  -Path $authBackupScript `
  -Description "Supabase Auth backup script"

Assert-FileExists `
  -Path $r2BackupScript `
  -Description "R2 backup script"

Assert-FileExists `
  -Path $r2RestoreScript `
  -Description "R2 verification and restore script"

$nodeCommand =
  Get-Command `
    "node" `
    -ErrorAction SilentlyContinue

if (
  -not $nodeCommand
) {
  throw (
    "Node.js was not found in PATH."
  )
}

$nodePath =
  $nodeCommand.Source

$startedAt =
  Get-Date

Push-Location $projectRoot

try {
  Write-Host ""
  Write-Host "========================================"
  Write-Host "BeatMarket complete backup"
  Write-Host "========================================"
  Write-Host ""
  Write-Host "The database backup will request the"
  Write-Host "current Supabase database password."
  Write-Host ""

  Write-Host "STEP 1 OF 4"
  Write-Host "Creating Supabase public database backup..."
  Write-Host ""

  & $databaseBackupScript

  if (
    -not $?
  ) {
    throw (
      "The Supabase public database " +
      "backup failed."
    )
  }

  Write-Host ""
  Write-Host "STEP 1 PASSED"
  Write-Host ""

  Write-Host "STEP 2 OF 4"
  Write-Host "Creating Supabase Auth metadata backup..."
  Write-Host ""

  $null =
    Invoke-NodeScript `
      -NodePath $nodePath `
      -ScriptPath $authBackupScript

  Write-Host ""
  Write-Host "STEP 2 PASSED"
  Write-Host ""

  Write-Host "STEP 3 OF 4"
  Write-Host "Creating Cloudflare R2 object backup..."
  Write-Host ""

  $r2BackupOutput =
    Invoke-NodeScript `
      -NodePath $nodePath `
      -ScriptPath $r2BackupScript

  $r2BackupDirectoryLine =
    $r2BackupOutput |
      ForEach-Object {
        [string]$_
      } |
      Where-Object {
        $_ -like "BACKUP_DIRECTORY=*"
      } |
      Select-Object `
        -Last 1

  if (
    -not $r2BackupDirectoryLine
  ) {
    throw (
      "The R2 backup completed without " +
      "returning its backup directory."
    )
  }

  $reportedR2BackupDirectory =
    $r2BackupDirectoryLine.Substring(
      "BACKUP_DIRECTORY=".Length
    ).Trim()

  $r2BackupDirectory =
    Resolve-R2BackupDirectory `
      -ReportedPath `
        $reportedR2BackupDirectory

  Write-Host ""
  Write-Host "STEP 3 PASSED"
  Write-Host ""

  Write-Host "STEP 4 OF 4"
  Write-Host "Verifying the new R2 backup..."
  Write-Host ""

  $null =
    Invoke-NodeScript `
      -NodePath $nodePath `
      -ScriptPath $r2RestoreScript `
      -AdditionalArguments @(
        $r2BackupDirectory
      )

  Write-Host ""
  Write-Host "STEP 4 PASSED"
  Write-Host ""

  $completedAt =
    Get-Date

  $duration =
    $completedAt -
    $startedAt

  Write-Host "========================================"
  Write-Host "ALL_BACKUPS_SUCCESSFUL"
  Write-Host "========================================"

  Write-Host (
    "STARTED_AT=" +
    $startedAt.ToString("o")
  )

  Write-Host (
    "COMPLETED_AT=" +
    $completedAt.ToString("o")
  )

  Write-Host (
    "DURATION_SECONDS=" +
    [math]::Round(
      $duration.TotalSeconds,
      2
    )
  )

  Write-Host (
    "VERIFIED_R2_BACKUP_DIRECTORY=" +
    $r2BackupDirectory
  )
} catch {
  Write-Host ""
  Write-Host "========================================"
  Write-Host "BACKUP_SEQUENCE_FAILED"
  Write-Host "========================================"

  Write-Host (
    $_.Exception.Message
  )

  exit 1
} finally {
  Pop-Location
}