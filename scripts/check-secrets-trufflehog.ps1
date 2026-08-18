# S0.4.2 CI-07 Secret Scan secondary: trufflehog filesystem (PS5 UTF-8 BOM)
# Exit: 0 pass / 1 secret / 2 error

[CmdletBinding()]
param(
  [string]$RootDir
)

$ErrorActionPreference = 'Stop'

# Match the primary scanner's host-safe root resolution. Some PowerShell
# wrappers leave MyInvocation.MyCommand.Path empty.
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

Write-Host ('[check-secrets-trufflehog PS] RootDir=' + $RootDir + ' (secondary; gitleaks primary)')

if (-not (Get-Command trufflehog -ErrorAction SilentlyContinue)) {
  Write-Host '[check-secrets-trufflehog PS] SKIP: trufflehog not installed. Install: winget install TruffleSecurity.TruffleHog. Skipping does not block.'
  exit 0
}

try {
  $cmd = @('filesystem', $RootDir, '--no-update', '--exclude-glob=.git/**', '--exclude-glob=node_modules/**', '--exclude-glob=.pnpm-store/**', '--exclude-glob=dist/**', '--exclude-glob=build/**', '--exclude-glob=coverage/**', '--exclude-glob=**/*.map')
  & trufflehog @cmd 2>&1 | ForEach-Object { Write-Host $_ }
  $ec = $LASTEXITCODE
  if ($ec -eq 0) { Write-Host '[check-secrets-trufflehog PS] OK: no SaaS detector matches'; exit 0 }
  Write-Host -ForegroundColor Red ('[check-secrets-trufflehog PS] FAIL: exit=' + $ec)
  exit 1
} catch {
  Write-Host -ForegroundColor Red ('[check-secrets-trufflehog PS] ERR: ' + $_)
  exit 2
}
