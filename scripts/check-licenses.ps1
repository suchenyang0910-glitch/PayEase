# S0-3.1 CI-05 许可证 allowlist 扫描（PowerShell 5 Windows 原生版本）
#
# 对应脚本：scripts/check-licenses.sh
#
# 退出码：0 成功，1 未授权许可，2 环境错误

[CmdletBinding()]
param(
  [string]$RootDir = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)

$ErrorActionPreference = 'Stop'

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
  Write-Host -ForegroundColor Red "[check-licenses PS] ERR: node.exe not found. 需要 Node.js >= 20.17"
  exit 2
}

try {
  $scriptFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.mjs')
  $outFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.json')
  $allowlistStr = ($Allowlist | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }) -join ','

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
      Write-Host -ForegroundColor Red "[check-licenses PS] ERR: node script exit=$nodeExit"
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $scriptFile -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path -LiteralPath $outFile)) {
    Write-Host -ForegroundColor Red "[check-licenses PS] ERR: 未生成扫描结果"
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
    Write-Host "[check-licenses PS] OK: 全部外部依赖许可均在 allowlist"
    exit 0
  }

  Write-Host -ForegroundColor Red "[check-licenses PS] FAIL: 发现 $($report.Count) 个未授权包："
  $report | Format-Table -AutoSize -Wrap | Out-String -Width 400 | Write-Host
  Write-Host
  Write-Host "解决：1) 替换为 allowlist 内的替代；2) SECURITY_EXCEPTIONS.yml 双签字登记；3) 加入 allowlist 前法务审阅。"
  exit 1
} catch {
  Write-Host -ForegroundColor Red "[check-licenses PS] ERR: $_"
  exit 2
}
