# PayEase V1 local acceptance gate. This script intentionally fails closed:
# a release candidate cannot be marked accepted without the disposable
# PostgreSQL integration database that exercises tenant and workflow rules.
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$IntegrationDatabaseUrl,
  [string]$RootDir
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
  $RootDir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PSScriptRoot))
}
if (-not (Test-Path -LiteralPath (Join-Path $RootDir 'package.json'))) {
  Write-Error '[v1-acceptance] repository package.json not found'
  exit 2
}
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  Write-Error '[v1-acceptance] pnpm.cmd is required'
  exit 2
}
try {
  $integrationUri = [Uri]$IntegrationDatabaseUrl
  if ($integrationUri.Scheme -notin @('postgres', 'postgresql') -or $integrationUri.AbsolutePath.Trim('/') -ne 'payease_test') {
    throw 'invalid disposable integration database target'
  }
} catch {
  Write-Error '[v1-acceptance] IntegrationDatabaseUrl must target a disposable PostgreSQL database named payease_test'
  exit 2
}

function Invoke-Gate([string]$Name, [scriptblock]$Command) {
  Write-Host "[v1-acceptance] START $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    Write-Error "[v1-acceptance] FAIL $Name (exit=$LASTEXITCODE)"
    exit $LASTEXITCODE
  }
  Write-Host "[v1-acceptance] PASS $Name"
}

Push-Location $RootDir
try {
  Invoke-Gate 'format' { pnpm.cmd format:check }
  Invoke-Gate 'typecheck' { pnpm.cmd typecheck }
  Invoke-Gate 'unit tests' { pnpm.cmd test }
  Invoke-Gate 'money guard' { & (Join-Path $RootDir 'scripts\check-money-type.ps1') -RootDir $RootDir }
  Invoke-Gate 'license guard' { & (Join-Path $RootDir 'scripts\check-licenses.ps1') -RootDir $RootDir }

  # Do not echo this value: it can contain a password even though it must
  # point only to a disposable database named payease_test.
  $env:PAYEASE_TEST_DATABASE_URL = $IntegrationDatabaseUrl
  Invoke-Gate 'PostgreSQL integration tests' {
    pnpm.cmd --filter '@payease/broker-api' run test:integration
  }
  Write-Host '[v1-acceptance] LOCAL ACCEPTANCE PASSED'
} finally {
  Remove-Item Env:PAYEASE_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
