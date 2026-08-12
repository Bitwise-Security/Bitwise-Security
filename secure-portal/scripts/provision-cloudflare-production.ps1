[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$portalRoot = Split-Path -Parent $PSScriptRoot
$edgeRoot = Join-Path $portalRoot "apps\edge"
$wrangler = Join-Path $portalRoot "node_modules\.bin\wrangler.cmd"
$config = Join-Path $edgeRoot "wrangler.production.jsonc"
$bootstrapConfig = Join-Path $edgeRoot "wrangler.bootstrap.production.jsonc"
$bucketName = "bitwise-secure-portal-files"
$databaseName = "bitwise-secure-portal-db"
$workerName = "bitwise-secure-portal"
$productionOrigin = "https://portal.bitwise-security.nl"

function Get-PortalProductionValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($Name, "User")
  }
  return $value
}

if (-not (Test-Path -LiteralPath $wrangler)) {
  throw "Wrangler is not installed. Run npm ci in secure-portal first."
}

$requiredVariables = @(
  "CLOUDFLARE_API_TOKEN",
  "PORTAL_PRODUCTION_MFA_ENCRYPTION_KEY",
  "PORTAL_PRODUCTION_SESSION_PEPPER",
  "PORTAL_PRODUCTION_FILE_KEY_RING",
  "PORTAL_PRODUCTION_RESEND_API_KEY",
  "PORTAL_PRODUCTION_ADMIN_EMAIL",
  "PORTAL_PRODUCTION_ADMIN_PASSWORD"
)
foreach ($variableName in $requiredVariables) {
  if ([string]::IsNullOrWhiteSpace((Get-PortalProductionValue $variableName))) {
    throw "Required environment variable $variableName is missing."
  }
}

$env:CLOUDFLARE_API_TOKEN = Get-PortalProductionValue "CLOUDFLARE_API_TOKEN"
$keyRingText = Get-PortalProductionValue "PORTAL_PRODUCTION_FILE_KEY_RING"
$keyRing = $keyRingText | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($keyRing.current) -or $null -eq $keyRing.keys) {
  throw "PORTAL_PRODUCTION_FILE_KEY_RING must contain current and keys fields."
}

$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
$dockerPath = if ($null -eq $dockerCommand) { $null } else { $dockerCommand.Source }
if ([string]::IsNullOrWhiteSpace($dockerPath)) {
  $dockerPath = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
  if (-not (Test-Path -LiteralPath $dockerPath)) { $dockerPath = $null }
}
if ([string]::IsNullOrWhiteSpace($dockerPath)) { throw "Docker Desktop is required for the production ClamAV container build." }
& $dockerPath info *> $null
if ($LASTEXITCODE -ne 0) { throw "Start Docker Desktop before provisioning production." }
$env:WRANGLER_DOCKER_BIN = $dockerPath
$env:Path = "$(Split-Path -Parent $dockerPath);$env:Path"

Push-Location $edgeRoot
try {
  & $wrangler r2 bucket info $bucketName --config $config *> $null
  if ($LASTEXITCODE -ne 0) { throw "The dedicated production R2 bucket $bucketName was not found." }
  & $wrangler d1 info $databaseName --config $config *> $null
  if ($LASTEXITCODE -ne 0) { throw "The dedicated production D1 database $databaseName was not found." }

  & $wrangler d1 migrations apply $databaseName --remote --config $config
  if ($LASTEXITCODE -ne 0) { throw "Production D1 migrations failed." }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $wrangler deployments list --name $workerName --config $config *> $null
    $productionWorkerExists = $LASTEXITCODE -eq 0
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if (-not $productionWorkerExists) {
    & $wrangler deploy --config $bootstrapConfig
    if ($LASTEXITCODE -ne 0) { throw "Failed to create the unreachable production Worker shell." }
  }

  $secrets = [ordered]@{
    MFA_ENCRYPTION_KEY = Get-PortalProductionValue "PORTAL_PRODUCTION_MFA_ENCRYPTION_KEY"
    SESSION_PEPPER = Get-PortalProductionValue "PORTAL_PRODUCTION_SESSION_PEPPER"
    FILE_KEY_RING = $keyRingText
    RESEND_API_KEY = Get-PortalProductionValue "PORTAL_PRODUCTION_RESEND_API_KEY"
    BOOTSTRAP_ADMIN_EMAIL = Get-PortalProductionValue "PORTAL_PRODUCTION_ADMIN_EMAIL"
    BOOTSTRAP_ADMIN_PASSWORD = Get-PortalProductionValue "PORTAL_PRODUCTION_ADMIN_PASSWORD"
  }
  foreach ($secretName in $secrets.Keys) {
    $secrets[$secretName] | & $wrangler secret put $secretName --config $config
    if ($LASTEXITCODE -ne 0) { throw "Failed to set production Worker secret $secretName." }
  }

  & $wrangler deploy --config $config
  if ($LASTEXITCODE -ne 0) { throw "Production deployment failed." }

  $healthy = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "$productionOrigin/api/v1/health" -TimeoutSec 20
      if ($health.status -eq "ok") { $healthy = $true; break }
    }
    catch {}
    Start-Sleep -Seconds 15
  }
  if (-not $healthy) { throw "Production did not become healthy; bootstrap credentials were retained for recovery." }

  foreach ($bootstrapSecret in @("BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD")) {
    & $wrangler secret delete $bootstrapSecret --config $config
    if ($LASTEXITCODE -ne 0) { throw "Failed to remove temporary production bootstrap secret $bootstrapSecret." }
  }

  $healthAfterRemoval = Invoke-RestMethod -Uri "$productionOrigin/api/v1/health" -TimeoutSec 20
  if ($healthAfterRemoval.status -ne "ok") { throw "Production health check failed after bootstrap-secret removal." }
  Write-Output "Deployed only $workerName with D1 $databaseName, R2 $bucketName, and portal.bitwise-security.nl."
}
finally {
  Pop-Location
}
