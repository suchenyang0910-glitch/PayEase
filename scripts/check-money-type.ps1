# S0-3.1 CI-10 Money number 检测（PowerShell 5 Windows 原生版本）
#
# 对应脚本：scripts/check-money-type.sh
#
# 退出码：0 成功，1 违规，2 环境错误

[CmdletBinding()]
param(
  [string]$RootDir = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)

$ErrorActionPreference = 'Stop'

$MoneyKeywords = @('amount','fee','total','price','principal','interest','balance','repay','discount','refund','rebate','tax','charge','commission','quota','credit','debit','settledAmount','settledFee','settlementAmount')
$KeywordRe = ($MoneyKeywords | ForEach-Object { [regex]::Escape($_) }) -join '|'

$Pattern = "(?i)(?<!\()([\t ]*)(($KeywordRe)[A-Za-z0-9_]*)[\t ]*[:!?][\t ]*number[\t ]*(?![A-Za-z_\[])"
# 仅扫描源码，不扫描文档/构建产物
$Exts = @('.ts','.tsx','.js','.jsx','.mts','.cts','.mjs','.cjs')
$SkipDirs = @('node_modules','.pnpm-store','dist','build','coverage','.git','.turbo','.cache','.vitest')
$AllowlistPrefixes = @(
  (Join-Path $RootDir 'packages\shared-money\src'),
  (Join-Path $RootDir 'packages\shared-money\__tests__'),
  (Join-Path $RootDir 'packages\shared-security\__tests__'),
  (Join-Path $RootDir '.semgrep\README.ts')
)
# 明确允许 number 入参的金额转换函数
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
    Write-Host -ForegroundColor Red "[check-money-type PS] FAIL: 发现 $($allMatches.Count) 处 Money 字段以 number 类型表达 (CI-10)，请改为 { amountMinor: string; currency }："
    $allMatches | Format-Table -AutoSize -Wrap | Out-String -Width 400 | Write-Host
    Write-Host
    Write-Host "提示：若该字段确非金额，请在行尾加注释 // IGNORE-MONEY-NUMBER 并在 SECURITY_EXCEPTIONS.yml 登记审批。"
    exit 1
  }

  Write-Host "[check-money-type PS] OK: 未发现 amount/fee 类字段使用 TS number"
  exit 0
} catch {
  Write-Host -ForegroundColor Red "[check-money-type PS] ERR: $_"
  exit 2
}
