#!/usr/bin/env bash
# S0-3.1 CI-05 许可证扫描（Linux / macOS / WSL）
#
# 仅 allowlist 许可合入；其它许可需 SECURITY_EXCEPTIONS.yml 双签字登记。
#
# 退出码：
#   0 通过
#   1 发现未授权许可
#   2 环境错误（无 pnpm / node）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# MIT / Apache-2.0 / BSD-2-Clause / BSD-3-Clause / ISC / CC0-1.0 / 0BSD / Unlicense / BlueOak-1.0.0
# 必须逐个列明以避免 (MIT OR Apache-2.0) 被误识别为未知。
ALLOWLIST=(
  "MIT"
  "Apache-2.0"
  "Apache 2.0"
  "Apache 2"
  "BSD-2-Clause"
  "BSD-3-Clause"
  "BSD-2-Clause-FreeBSD"
  "ISC"
  "CC0-1.0"
  "0BSD"
  "Unlicense"
  "UNLICENSED"
  "(MIT OR Apache-2.0)"
  "(MIT AND BSD-3-Clause)"
  "(AFL-2.1 OR BSD-3-Clause)"
  "(MIT OR CC0-1.0)"
  "(BSD-2-Clause OR MIT OR Apache-2.0)"
  "BlueOak-1.0.0"
  "Python-2.0"
  "HPND"
  "Zlib"
  "Artistic-2.0"
  "Ruby"
)

echo "[check-licenses] ROOT_DIR=${ROOT_DIR}"
echo "[check-licenses] allowlist 数量：${#ALLOWLIST[@]}"

if ! command -v node >/dev/null 2>&1; then
  echo "[check-licenses] ERR: 未找到 node，请先按根 package.json engines 安装 node>=20.17" >&2
  exit 2
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[check-licenses] ERR: 未找到 pnpm，请 corepack enable 或使用项目指定版本 9.12" >&2
  exit 2
fi

# 如果没有 node_modules，先 install；否则读取当前
if [ ! -d "node_modules" ]; then
  echo "[check-licenses] node_modules 不存在，执行 pnpm install --ignore-scripts --frozen-lockfile 为扫描做准备"
  pnpm install --ignore-scripts --frozen-lockfile
fi

# 使用 Node 小脚本递归读取每个 package.json 并校验，避免引入额外扫描工具作为 S0.3 依赖
OUT_TMP="$(mktemp)"
ALLOWLIST_STR="$(IFS=, ; echo "${ALLOWLIST[*]}")"
export PAYEASE_LICENSE_ALLOWLIST="${ALLOWLIST_STR}"
trap 'rm -f "${OUT_TMP}"' EXIT

node <<'NODE_SCRIPT' "${OUT_TMP}" "$(pwd)"
const fs = require('fs');
const path = require('path');
const out = process.argv[1];
const root = process.argv[2];
const allowlistRaw = process.env.PAYEASE_LICENSE_ALLOWLIST || '';
const allowlist = new Set(allowlistRaw.split(/\s*,\s*/).filter(Boolean));

const skipDirs = new Set([
  'node_modules', '.pnpm-store', '.git', 'dist', 'build', 'coverage', '.turbo',
]);
const reportLines = [];

function* walk(dir, depth = 0) {
  if (depth > 8) return;
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

function normalize(license) {
  if (!license) return 'NONE';
  if (typeof license === 'string') return license.trim();
  if (typeof license === 'object' && license.type) return String(license.type).trim();
  return JSON.stringify(license);
}

const visited = new Set();
for (const pkgJsonPath of walk(root)) {
  try {
    const text = fs.readFileSync(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(text);
    const name = pkg.name || pkgJsonPath;
    const version = pkg.version || '';
    const license = normalize(pkg.license || pkg.licenses);
    const key = `${name}@${version}::${license}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!allowlist.has(license) && !/^PRIVATE$/i.test(license) && !(pkg.private === true && !pkg.publishConfig)) {
      // root 包 private=true 且明确无许可 → 允许（我们自己的 monorepo）
      if (pkg.private === true) continue;
      reportLines.push({
        path: path.relative(root, pkgJsonPath),
        name,
        version,
        license,
      });
    }
  } catch (err) {
    // parse error 不中断，记一行
    reportLines.push({ path: pkgJsonPath, name: '<parse-error>', version: err.message, license: 'UNKNOWN' });
  }
}

fs.writeFileSync(out, JSON.stringify(reportLines, null, 2), 'utf8');
NODE_SCRIPT

if [ ! -s "${OUT_TMP}" ]; then
  echo "[check-licenses] OK: 全部外部依赖许可均在 allowlist 内"
  exit 0
fi

COUNT="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).length)" "${OUT_TMP}")"
echo "[check-licenses] FAIL: 发现 ${COUNT} 个未授权许可的包，列表如下：" >&2
cat "${OUT_TMP}" >&2
echo
echo "[check-licenses] 解决：1) 替换为 allowlist 许可的替代包；2) 登记 SECURITY_EXCEPTIONS.yml + 工程 Owner + 安全 Owner 双签字；3) 加入 allowlist 前须法务审阅。" >&2
exit 1
