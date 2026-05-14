param(
  [string]$OutputDir = ".\backups"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

if (!(Test-Path $envFile)) {
  throw "Missing .env file. Copy .env.example to .env first."
}

$envMap = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $parts = $_ -split "=", 2
  $envMap[$parts[0].Trim()] = $parts[1].Trim()
}

$dbName = $envMap["POSTGRES_DB"]
$dbUser = $envMap["POSTGRES_USER"]
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$target = Join-Path $backupDir "restaurantos-$timestamp.sql"
docker compose --env-file $envFile -f (Join-Path $root "docker-compose.yml") exec -T db pg_dump -U $dbUser -d $dbName --clean --if-exists --no-owner > $target

Write-Host "Backup created: $target"
