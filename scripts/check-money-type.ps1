# S0-3.1 CI-10 Money number guard (PowerShell 5 Windows native)
#
# Pair: scripts/check-money-type.sh
#
# Exit codes: 0=ok, 1=violation, 2=environment error

param(
  [string]$RootDir
)

$ErrorActionPreference = 'Stop'

# RootDir resolution (4 call-site compatibility levels, pure ASCII, .NET-only path APIs to avoid PS5 Split-Path AmbiguousParameterSet):
#   1. explicit -RootDir <path> passed by caller
#   2. direct execution / dot-source  -> $PSScriptRoot (scripts/) -> [IO.Path]::GetDirectoryName -> parent = repo root
#   3. traditional invocation         -> MyInvocation.MyCommand.Path -> 2x parent
#   4. & sandbox / nested / 1..3 empty -> fallback to Get-Location (cwd) with WARNING
if ([string]::IsNullOrWhiteSpace($RootDir)) {
  $candidate = $null
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    try { $candidate = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($PSScriptRoot)) } catch { $candidate = $null }
  }
  if ([string]::IsNullOrWhiteSpace($candidate) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    try {
      $scriptDir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($MyInvocation.MyCommand.Path))
      if (-not [string]::IsNullOrWhiteSpace($scriptDir)) {
        $candidate = [IO.Path]::GetDirectoryName($scriptDir)
      }
    } catch {
      $candidate = $null
    }
  }
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = (Get-Location).Path
    Write-Host -ForegroundColor Yellow "[check-money-type PS] WARN: PSScriptRoot / MyInvocation.MyCommand.Path both unusable; fallback RootDir=<cwd>=$candidate"
  }
  $RootDir = $candidate
}

$MoneyKeywords = @('amount','fee','total','price','principal','interest','balance','repay','discount','refund','rebate','tax','charge','commission','quota','credit','debit','settledAmount','settledFee','settlementAmount')
$KeywordRe = ($MoneyKeywords | ForEach-Object { [regex]::Escape($_) }) -join '|'

$Pattern = "(?i)(?<!\()([\t ]*)(($KeywordRe)[A-Za-z0-9_]*)[\t ]*[:!?][\t ]*number[\t ]*(?![A-Za-z_\[])"
$Exts = @('.ts','.tsx','.js','.jsx','.mts','.cts','.mjs','.cjs')
$SkipDirs = @('node_modules','.pnpm-store','dist','build','coverage','.git','.turbo','.cache','.vitest')
$AllowlistPrefixes = @(
  (Join-Path $RootDir 'packages\shared-money\src'),
  (Join-Path $RootDir 'packages\shared-money\__tests__'),
  (Join-Path $RootDir 'packages\shared-security\__tests__'),
  (Join-Path $RootDir '.semgrep\README.ts')
)
$ParamNumberAllowedFns = @('fromMajor','toMajorBig','toMajorString','moneyMulScalar','moneyDivScalar')

Write-Host "[check-money-type PS] RootDir=$RootDir"
Write-Host "[check-money-type PS] Scanning extensions: $($Exts -join ', ')"

if (-not (Test-Path -LiteralPath $RootDir)) {
  Write-Host -ForegroundColor Red "[check-money-type PS] ERR: root dir not found: $RootDir"
  exit 2
}

function SkipByDir([string]$FullName) {
  foreach ($sd in $SkipDirs) {
    $pattern = [IO.Path]::DirectorySeparatorChar + $sd + [IO.Path]::DirectorySeparatorChar
    if ($FullName.Contains($pattern)) { return $true }
    if ($FullName.EndsWith([IO.Path]::DirectorySeparatorChar + $sd)) { return $true }
  }
  return $false
}

try {
  $allMatches = New-Object System.Collections.ArrayList
  $queue = New-Object System.Collections.Generic.Queue[string]
  $queue.Enqueue($RootDir)

  while ($queue.Count -gt 0) {
    $dir = $queue.Dequeue()
    try {
      $subs = [IO.Directory]::GetDirectories($dir)
      foreach ($sd in $subs) {
        if (SkipByDir $sd) { continue }
        $queue.Enqueue($sd)
      }
      $files = [IO.Directory]::GetFiles($dir)
      foreach ($f in $files) {
        $ext = [IO.Path]::GetExtension($f)
        if (-not $Exts.Contains($ext)) { continue }
        if (SkipByDir $f) { continue }
        $skipPrefix = $false
        foreach ($prefix in $AllowlistPrefixes) {
          if ($f.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { $skipPrefix = $true; break }
        }
        if ($skipPrefix) { continue }

        try {
          $lines = [IO.File]::ReadAllLines($f, [Text.UTF8Encoding]::new($false))
          for ($i = 0; $i -lt $lines.Length; $i++) {
            $line = $lines[$i]
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            if ($line.Length -gt 20000) { continue }
            if ($line -match 'IGNORE-MONEY-NUMBER') { continue }
            if (-not ([regex]::IsMatch($line, $Pattern))) { continue }
            $allowedParam = $false
            foreach ($fn in $ParamNumberAllowedFns) {
              if ($line.Contains($fn)) { $allowedParam = $true; break }
            }
            if ($allowedParam) { continue }
            $rel = $f.Substring($RootDir.Length + [Math]::Min($RootDir.Length + 1, 1)).TrimStart('\','/')
            $null = $allMatches.Add([PSCustomObject]@{
              File = $rel
              Line = ($i + 1)
              Text = $line.Trim()
            })
          }
        } catch {
          # skip unreadable files
        }
      }
    } catch {
      # skip permission denied dirs
    }
  }

  if ($allMatches.Count -gt 0) {
    Write-Host -ForegroundColor Red "[check-money-type PS] FAIL: $($allMatches.Count) money field(s) declared as TS number (CI-10). Rewrite as { amountMinor: string; currency }:"
    $allMatches | Format-Table -AutoSize -Wrap | Out-String -Width 400 | Write-Host
    Write-Host
    Write-Host "If this line is NOT a monetary amount, add comment // IGNORE-MONEY-NUMBER at end of line AND register the exception in SECURITY_EXCEPTIONS.yml with dual owner sign-off."
    exit 1
  }

  Write-Host "[check-money-type PS] OK: no money keyword fields declared as TS number"
  exit 0
} catch {
  Write-Host -ForegroundColor Red "[check-money-type PS] ERR: $_"
  exit 2
}
