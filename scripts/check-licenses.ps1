# S0-3.1 CI-05 License allowlist scanner (PowerShell 5 Windows native)
#
# Pair: scripts/check-licenses.sh
#
# Exit codes: 0=ok, 1=unapproved license, 2=environment error

param(
  [string]$RootDir
)

$ErrorActionPreference = 'Stop'

# RootDir resolution (4 call-site compatibility levels, pure ASCII, .NET-only path APIs to avoid PS5 Split-Path AmbiguousParameterSet):
#   1. explicit -RootDir <path>
#   2. direct / dot-source execution -> $PSScriptRoot (scripts/) parent = repo root
#   3. traditional invocation      -> MyInvocation.MyCommand.Path 2x parent
#   4. & sandbox / nested / empty  -> fallback Get-Location (cwd) with WARNING
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
    Write-Host -ForegroundColor Yellow "[check-licenses PS] WARN: PSScriptRoot / MyInvocation.MyCommand.Path both unusable; fallback RootDir=<cwd>=$candidate"
  }
  $RootDir = $candidate
}

$Allowlist = @(
  'MIT','Apache-2.0','Apache 2.0','Apache 2','BSD-2-Clause','BSD-3-Clause',
  'BSD-2-Clause-FreeBSD','ISC','CC0-1.0','0BSD','Unlicense','UNLICENSED',
  '(MIT OR Apache-2.0)','(MIT AND BSD-3-Clause)','(AFL-2.1 OR BSD-3-Clause)',
  '(MIT OR CC0-1.0)','(BSD-2-Clause OR MIT OR Apache-2.0)','BlueOak-1.0.0',
  'Python-2.0','HPND','Zlib','Artistic-2.0','Ruby'
)
$SkipDirs = @('node_modules','.pnpm-store','.git','dist','build','coverage','.turbo')

Write-Host "[check-licenses PS] RootDir=$RootDir"
Write-Host "[check-licenses PS] Allowlist count=$($Allowlist.Count)"

if (-not (Test-Path -LiteralPath $RootDir)) {
  Write-Host -ForegroundColor Red "[check-licenses PS] ERR: root dir not found: $RootDir"
  exit 2
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host -ForegroundColor Red "[check-licenses PS] ERR: node.exe not found. Node.js >= 22 required."
  exit 2
}

try {
  $scriptFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.mjs')
  $outFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.json')

  $nodeCode = @'
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2];
const root = process.argv[3];
const allowlist = new Set(process.argv.slice(4));
const skipDirs = new Set(['node_modules','.pnpm-store','.git','dist','build','coverage','.turbo']);
const report = [];
function normalize(lic) {
  if (!lic) return 'NONE';
  if (typeof lic === 'string') return lic.trim();
  if (lic && typeof lic === 'object' && lic.type) return String(lic.type).trim();
  return JSON.stringify(lic);
}
function* walk(dir, depth) {
  if (depth > 8) return;
  depth = depth || 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      if (e.name.startsWith('.pnpm')) continue;
      yield* walk(p, depth + 1);
    } else if (e.isFile() && e.name === 'package.json') {
      yield p;
    }
  }
}
const visited = new Set();
for (const p of walk(root)) {
  try {
    const text = fs.readFileSync(p, 'utf8');
    const pkg = JSON.parse(text);
    const name = pkg.name || p;
    const version = pkg.version || '';
    const license = normalize(pkg.license || pkg.licenses);
    const key = `${name}@${version}::${license}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (pkg.private === true && path.dirname(p) === root) continue;
    if (/^PRIVATE$/i.test(license)) continue;
    if (pkg.private === true) continue;
    if (allowlist.has(license)) continue;
    report.push({ path: path.relative(root, p), name, version, license });
  } catch (err) {
    report.push({ path: p, name: '<parse-error>', version: String((err && err.message) || err), license: 'UNKNOWN' });
  }
}
fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
'@

  Set-Content -LiteralPath $scriptFile -Value $nodeCode -Encoding UTF8
  try {
    $cliArgs = @($scriptFile, $outFile, $RootDir) + $Allowlist
    & node.exe @cliArgs 2>&1 | Out-Null
    $nodeExit = $LASTEXITCODE
    if ($nodeExit -ne 0) {
      Write-Host -ForegroundColor Red "[check-licenses PS] ERR: node scanner exit=$nodeExit"
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $scriptFile -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path -LiteralPath $outFile)) {
    Write-Host -ForegroundColor Red "[check-licenses PS] ERR: scanner did not produce report JSON"
    exit 2
  }

  $rawJson = Get-Content -LiteralPath $outFile -Raw -Encoding UTF8
  $parsed = $null
  if (-not [string]::IsNullOrWhiteSpace($rawJson)) {
    $parsed = $rawJson | ConvertFrom-Json -ErrorAction Stop
  }
  $report = @()
  if ($parsed -ne $null) {
    if ($parsed -is [Array]) { $report = @($parsed) }
    elseif ($parsed -is [System.Collections.IEnumerable]) { $report = @($parsed) }
    else { $report = @($parsed) }
  }
  Remove-Item -LiteralPath $outFile -ErrorAction SilentlyContinue

  if ($report.Count -eq 0) {
    Write-Host "[check-licenses PS] OK: all external licenses are in the allowlist"
    exit 0
  }

  Write-Host -ForegroundColor Red "[check-licenses PS] FAIL: $($report.Count) package(s) have unapproved license(s):"
  $report | Format-Table -AutoSize -Wrap | Out-String -Width 400 | Write-Host
  Write-Host
  Write-Host "Remediation (pick one): 1) replace with an allowlisted alternative; 2) dual owner sign-off in SECURITY_EXCEPTIONS.yml and re-run; 3) add to allowlist ONLY after legal review."
  exit 1
} catch {
  Write-Host -ForegroundColor Red "[check-licenses PS] ERR: $_"
  exit 2
}
