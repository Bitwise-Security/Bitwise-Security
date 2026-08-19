[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertFrom-PortalSecureString([Security.SecureString]$Value) {
  return [Net.NetworkCredential]::new("", $Value).Password
}

function New-PortalRandomBase64([int]$ByteCount) {
  $bytes = [byte[]]::new($ByteCount)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  }
  finally {
    $generator.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
}

$adminEmail = (Read-Host "Production administrator email").Trim().ToLowerInvariant()
try {
  $parsedEmail = [Net.Mail.MailAddress]::new($adminEmail)
  if ($parsedEmail.Address -ne $adminEmail) { throw "Email address is not canonical." }
}
catch {
  throw "Enter a valid production administrator email address."
}

$adminPasswordSecure = Read-Host "Production administrator password (12-128 characters)" -AsSecureString
$adminPassword = ConvertFrom-PortalSecureString $adminPasswordSecure
if ($adminPassword.Length -lt 12 -or $adminPassword.Length -gt 128 -or $adminPassword -match '[\x00-\x1f\x7f]') {
  throw "The administrator password must contain 12-128 characters and no control characters."
}

$resendKeySecure = Read-Host "New restricted Resend send-only API key" -AsSecureString
$resendKey = ConvertFrom-PortalSecureString $resendKeySecure
if ($resendKey -notmatch '^re_[A-Za-z0-9_]{20,}$') {
  throw "The Resend API key format is invalid."
}

$mfaKey = New-PortalRandomBase64 32
$sessionPepper = New-PortalRandomBase64 48
$fileKey = New-PortalRandomBase64 32
$fileKeyRing = @{ current = "v1"; keys = @{ v1 = $fileKey } } | ConvertTo-Json -Compress

try {
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_ADMIN_EMAIL", $adminEmail, "User")
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_ADMIN_PASSWORD", $adminPassword, "User")
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_RESEND_API_KEY", $resendKey, "User")
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_MFA_ENCRYPTION_KEY", $mfaKey, "User")
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_SESSION_PEPPER", $sessionPepper, "User")
  [Environment]::SetEnvironmentVariable("PORTAL_PRODUCTION_FILE_KEY_RING", $fileKeyRing, "User")
  Write-Output "Production portal secrets are stored in the Windows user environment. No secret values were printed."
}
finally {
  $adminPassword = $null
  $resendKey = $null
  $mfaKey = $null
  $sessionPepper = $null
  $fileKey = $null
  $fileKeyRing = $null
}
