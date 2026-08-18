# S0.4.2 CI-07 Secret Scan primary: gitleaks detect (PS5 UTF-8 BOM)
# Exit: 0 pass / 1 secret / 2 error

[CmdletBinding()]
param(
  [string]$RootDir,
  [switch]$ForceNoGit
)

$ErrorActionPreference = 'Stop'

# Resolve the repository root without assuming that MyInvocation contains a
# path. PowerShell hosts that invoke a script through a wrapper can leave it
# empty, while PSScriptRoot remains reliable for direct execution.
if ([string]::IsNullOrWhiteSpace($RootDir)) {
  $candidate = $null
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    try { $candidate = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PSScriptRoot)) } catch { $candidate = $null }
  }
  if ([string]::IsNullOrWhiteSpace($candidate) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    try {
      $scriptDir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($MyInvocation.MyCommand.Path))
      $candidate = [IO.Path]::GetDirectoryName($scriptDir)
    } catch { $candidate = $null }
  }
  if ([string]::IsNullOrWhiteSpace($candidate)) { $candidate = (Get-Location).Path }
  $RootDir = $candidate
}

$ConfigFile = Join-Path $RootDir '.gitleaks.toml'
$CacheDir = Join-Path $RootDir '.cache'
$ReportFile = Join-Path $CacheDir 'gitleaks-report.json'
New-Item -ItemType Directory -Force -Path $CacheDir -ErrorAction SilentlyContinue | Out-Null

Write-Host ('[check-secrets-gitleaks PS] RootDir=' + $RootDir)
Write-Host ('[check-secrets-gitleaks PS] Config=' + $ConfigFile)

if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) {
  Write-Host '[check-secrets-gitleaks PS] SKIP: gitleaks CLI not installed. Install: winget install gitleaks'
  Write-Host 'CI uses zricethezav/gitleaks-action by default; skip does not block production gate.'
  exit 0
}

if (-not (Test-Path -LiteralPath $ConfigFile)) {
  Write-Host -ForegroundColor Red ('[check-secrets-gitleaks PS] ERR: config missing at ' + $ConfigFile)
  exit 2
}

try {
  $cmd = @('detect', ('--source=' + $RootDir), ('--config=' + $ConfigFile), ('--report-path=' + $ReportFile), '--report-format=json', '--exit-code=1', '--verbose')
  if ($ForceNoGit -or -not (Test-Path -LiteralPath (Join-Path $RootDir '.git'))) { $cmd += '--no-git' }
  & gitleaks @cmd 2>&1 | ForEach-Object { Write-Host $_ }
  $ec = $LASTEXITCODE
  if ($ec -eq 0) { Write-Host '[check-secrets-gitleaks PS] OK: no known secret patterns detected'; Remove-Item -LiteralPath $ReportFile -ErrorAction SilentlyContinue; exit 0 }
  if ($ec -eq 1) {
    Write-Host -ForegroundColor Red '[check-secrets-gitleaks PS] FAIL: potential secrets found. Resolve: (a) dummy -> SECURITY_EXCEPTIONS.yml dual signed; (b) real leak -> revoke + git-filter-repo scrub history.'
    if (Test-Path -LiteralPath $ReportFile) { $t = Get-Content -LiteralPath $ReportFile -Raw -ErrorAction SilentlyContinue; if ($t) { Write-Host $t } }
    exit 1
  }
  Write-Host -ForegroundColor Red ('[check-secrets-gitleaks PS] ERR: gitleaks internal exit=' + $ec)
  exit 2
} catch {
  Write-Host -ForegroundColor Red ('[check-secrets-gitleaks PS] ERR: ' + $_)
  exit 2
}
