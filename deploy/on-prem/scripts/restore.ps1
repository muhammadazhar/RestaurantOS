param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

if (!(Test-Path $envFile)) {
  throw "Missing .env file. Copy .env.example to .env first."
}
if (!(Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$envMap = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $parts = $_ -split "=", 2
  $envMap[$parts[0].Trim()] = $parts[1].Trim()
}

$dbName = $envMap["POSTGRES_DB"]
$dbUser = $envMap["POSTGRES_USER"]
$composeFile = Join-Path $root "docker-compose.yml"

Get-Content $BackupFile | docker compose --env-file $envFile -f $composeFile exec -T db psql -U $dbUser -d $dbName

Write-Host "Restore completed from: $BackupFile"
