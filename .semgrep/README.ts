export const PAYEASE_SEMGREP_RULES = Object.freeze([
  "no-money-number.yaml",
  "no-localstorage-token.yaml",
  "no-sql-concat.yaml",
  "no-hardcoded-secrets.yaml",
]);

export const PAYEASE_SEMGREP_CONFIG = {
  // S0.3 本地门禁 baseline: CI-04 Semgrep / CodeQL placeholder 替换正则 SQL 扫描
  // 对应安全基线 v2 §3.1 CI-04 / CI-07 / CI-10 / WEB-08
  defaultSeverity: "ERROR",
  rulesDir: ".semgrep/rules",
  includeGlobs: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    "**/*.sql",
    "**/*.yaml",
    "**/*.yml",
    "**/*.json",
  ],
  // 本地执行命令参考（CI 用官方镜像更稳）：
  //   semgrep ci --config=.semgrep/rules --severity ERROR --max-memory 4096
  dockerImage:
    "semgrep/semgrep:1.96.0@sha256:a2b42f1e321ab6d02ef9d3c58e930455d4495a2e83e8f446b5e1a5d5f1fea92e",
  strictExitZero: true,
};
