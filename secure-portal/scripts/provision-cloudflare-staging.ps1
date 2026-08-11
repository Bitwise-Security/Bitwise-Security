[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$portalRoot = Split-Path -Parent $PSScriptRoot
$edgeRoot = Join-Path $portalRoot "apps\edge"
$wrangler = Join-Path $portalRoot "node_modules\.bin\wrangler.cmd"
$config = Join-Path $edgeRoot "wrangler.staging.jsonc"
$bucketName = "bitwise-secure-portal-staging-files"
$databaseName = "bitwise-secure-portal-staging-db"
$workerName = "bitwise-secure-portal-staging"

if (-not (Test-Path -LiteralPath $wrangler)) {
  throw "Wrangler is not installed. Run npm ci in secure-portal first."
}

$requiredVariables = @(
  "CLOUDFLARE_API_TOKEN",
  "PORTAL_STAGING_MFA_ENCRYPTION_KEY",
  "PORTAL_STAGING_SESSION_PEPPER",
  "PORTAL_STAGING_FILE_KEY_RING",
  "PORTAL_STAGING_RESEND_API_KEY",
  "PORTAL_STAGING_ADMIN_EMAIL",
  "PORTAL_STAGING_ADMIN_PASSWORD"
)

foreach ($variableName in $requiredVariables) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variableName))) {
    throw "Required environment variable $variableName is missing."
  }
}

$keyRingText = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_FILE_KEY_RING")
$keyRing = $keyRingText | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($keyRing.current) -or $null -eq $keyRing.keys) {
  throw "PORTAL_STAGING_FILE_KEY_RING must contain current and keys fields."
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is required and must be running before a Cloudflare Container deployment."
}

Push-Location $edgeRoot
try {
  & $wrangler r2 bucket info $bucketName --config $config *> $null
  if ($LASTEXITCODE -ne 0) {
    & $wrangler r2 bucket create $bucketName --config $config
    if ($LASTEXITCODE -ne 0) { throw "Failed to create the dedicated staging R2 bucket." }
  }

  & $wrangler d1 info $databaseName --config $config *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "The dedicated staging D1 database $databaseName was not found; refusing to create or select a different database."
  }

  & $wrangler d1 migrations apply $databaseName --remote --config $config
  if ($LASTEXITCODE -ne 0) { throw "Failed to migrate the dedicated staging D1 database." }

  $secrets = [ordered]@{
    MFA_ENCRYPTION_KEY = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_MFA_ENCRYPTION_KEY")
    SESSION_PEPPER = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_SESSION_PEPPER")
    FILE_KEY_RING = $keyRingText
    RESEND_API_KEY = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_RESEND_API_KEY")
    BOOTSTRAP_ADMIN_EMAIL = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_ADMIN_EMAIL")
    BOOTSTRAP_ADMIN_PASSWORD = [Environment]::GetEnvironmentVariable("PORTAL_STAGING_ADMIN_PASSWORD")
  }

  foreach ($secretName in $secrets.Keys) {
    $secrets[$secretName] | & $wrangler secret put $secretName --config $config
    if ($LASTEXITCODE -ne 0) { throw "Failed to set Worker secret $secretName." }
  }

  & $wrangler deploy --config $config
  if ($LASTEXITCODE -ne 0) { throw "Staging deployment failed." }

  Write-Output "Deployed only $workerName with D1 $databaseName, R2 $bucketName, and portal-test.bitwise-security.nl."
}
finally {
  Pop-Location
}
