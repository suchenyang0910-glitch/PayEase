#!/usr/bin/env bash
# S0.4.2 CI-07 Secret Scan 主防线：gitleaks detect
#
# 退出码：0=通过，1=阻断（发现密钥），2=环境/配置错误

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

CONFIG="${ROOT_DIR}/.gitleaks.toml"
REPORT="${ROOT_DIR}/.cache/gitleaks-report.json"
mkdir -p "$(dirname "${REPORT}")" 2>/dev/null || true

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "[check-secrets-gitleaks] SKIP: gitleaks CLI 未安装。请在本地安装："
  echo "  macOS:   brew install gitleaks"
  echo "  Linux:   apt-get -y install gitleaks  (或 https://github.com/gitleaks/gitleaks/releases)"
  echo "  Windows: winget install gitleaks"
  echo "CI 环境默认已预装在 ubuntu-latest + gitleaks action，因此本跳过不会影响生产门禁。"
  exit 0
fi

if [ ! -f "${CONFIG}" ]; then
  echo "[check-secrets-gitleaks] ERR: 配置文件不存在: ${CONFIG}" >&2
  exit 2
fi

# 既支持 git 历史扫描（CI 默认），也支持 --no-git 纯文件扫描（新建 monorepo 尚无 commit 的场景）
SCAN_MODE_ARGS=(detect --source="${ROOT_DIR}" --config="${CONFIG}" --report-path="${REPORT}" --report-format=json --exit-code=1 --verbose)
if [ ! -d "${ROOT_DIR}/.git" ] || [ "${FORCE_NO_GIT:-}" = "1" ]; then
  SCAN_MODE_ARGS+=(--no-git)
fi

gitleaks "${SCAN_MODE_ARGS[@]}"
STATUS=$?

if [ "${STATUS}" -eq 0 ]; then
  echo "[check-secrets-gitleaks] OK: 未发现已知密钥模式"
  rm -f "${REPORT}" 2>/dev/null || true
  exit 0
fi

if [ "${STATUS}" -eq 1 ]; then
  echo "[check-secrets-gitleaks] FAIL: 发现疑似密钥。解决：1) 如确为测试/占位，登记 SECURITY_EXCEPTIONS.yml 双签字 2) 如为真实泄露，立即吊销并清理 git history（git-filter-repo / BFG）" >&2
  if [ -s "${REPORT}" ]; then
    cat "${REPORT}" >&2
  fi
  exit 1
fi

echo "[check-secrets-gitleaks] ERR: gitleaks 内部错误，退出码=${STATUS}" >&2
exit 2
