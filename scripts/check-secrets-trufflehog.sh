#!/usr/bin/env bash
# S0.4.2 CI-07 Secret Scan 后备第二防线：TruffleHog filesystem 扫描
# 退出码：0 通过 1 阻断 2 错误（filesystem 模式，不触网）

set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v trufflehog >/dev/null 2>&1; then
  echo "[check-secrets-trufflehog] SKIP: trufflehog 未安装；S0.4 主防线 gitleaks 已启用。"
  exit 0
fi

trufflehog filesystem "${ROOT_DIR}" \
  --no-update \
  --exclude-glob=.git/** \
  --exclude-glob=node_modules/** \
  --exclude-glob=.pnpm-store/** \
  --exclude-glob=dist/** \
  --exclude-glob=build/** \
  --exclude-glob=coverage/** \
  --exclude-glob='**/*.map'

STATUS=$?
if [ "${STATUS}" -eq 0 ]; then
  echo "[check-secrets-trufflehog] OK"
  exit 0
fi
echo "[check-secrets-trufflehog] FAIL: exit=${STATUS}" >&2
exit 1
