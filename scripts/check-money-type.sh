#!/usr/bin/env bash
# S0-3.1 CI-10 (CI-10 Money string type guard - naive grep 版, Windows 请使用 check-money-type.ps1)
#
# 安全基线 §3.1 CI-10：任何金额/费用/本金/利息/余额 字段不得以 number 表示。
# 本脚本在 CI 中作为 Semgrep no-money-number.yaml 的补充防线。
#
# 退出码：
#   0 通过
#   1 发现违规
#   2 环境错误（缺少 grep / 无源码文件）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

MONEY_KEYWORDS_RE='(amount|fee|total|price|principal|interest|balance|repay|discount|discountAmount|settlement|settledAmount|settledFee)'
VIOLATION_RE="${MONEY_KEYWORDS_RE}[A-Za-z0-9_]*[\t ]*[:!?]*[\t ]*number(?!\[])|${MONEY_KEYWORDS_RE}[A-Za-z0-9_]*[\t ]*[:!?]*[\t ]*number[\t ]*(\||,|$)|${MONEY_KEYWORDS_RE}[A-Za-z0-9_]*[\t ]*[:!?]*[\t ]*Array<number>|${MONEY_KEYWORDS_RE}[A-Za-z0-9_]*[\t ]*[:!?]*[\t ]*number\[\]"

IGNORE_DIRS=(
  'node_modules'
  '.pnpm-store'
  'dist'
  'build'
  'coverage'
  '.git'
  '.turbo'
  '.cache'
  '.vitest'
)

EXTENSIONS=('*.ts' '*.tsx' '*.js' '*.jsx')

echo "[check-money-type] ROOT_DIR=${ROOT_DIR}"
echo "[check-money-type] 扫描 ${EXTENSIONS[*]} 目录：排除 ${IGNORE_DIRS[*]}"

EXCLUDES=()
for d in "${IGNORE_DIRS[@]}"; do
  EXCLUDES+=(--exclude-dir="${d}")
done

if ! command -v grep >/dev/null 2>&1; then
  echo "[check-money-type] ERR: 环境中无 grep，Windows 请使用 ./scripts/check-money-type.ps1" >&2
  exit 2
fi

TMP_OUT="$(mktemp)"
trap 'rm -f "${TMP_OUT}"' EXIT

set +e
grep -R -n -E \
  "${VIOLATION_RE}" \
  "${EXCLUDES[@]}" \
  --include='*.ts' \
  --include='*.tsx' \
  --include='*.js' \
  --include='*.jsx' \
  "${ROOT_DIR}" \
  >"${TMP_OUT}" 2>/dev/null
GREP_RC=$?
set -e

# grep 退出码：0=匹配到(违规) 1=无匹配 2=错误
if [ ${GREP_RC} -eq 2 ]; then
  echo "[check-money-type] grep 执行错误" >&2
  cat "${TMP_OUT}" >&2 || true
  exit 2
fi

# 允许列表：S0.1 shared-money 包定义的类型 / zod schema 引用不算违规
ALLOWLIST_RE='packages/shared-money/src/|packages/shared-money/__tests__/|packages/shared-security/src/__tests__/|packages/shared-security/__tests__/|.semgrep/README.ts'
FILTERED="$(grep -v -E "${ALLOWLIST_RE}" "${TMP_OUT}" || true)"

if [ -n "${FILTERED}" ]; then
  echo "[check-money-type] FAIL: 发现 Money 字段使用 number (CI-10)。请改为 { amountMinor: string; currency: Currency } 类型：" >&2
  echo "${FILTERED}" >&2
  echo
  echo "[check-money-type] 提示：若该字段非金额请改名或在行尾加 // IGNORE-MONEY-NUMBER 并登记 SECURITY_EXCEPTIONS.yml" >&2
  exit 1
fi

echo "[check-money-type] OK: 未发现 Money / amount / fee 字段使用 TS number"
exit 0
