# P2-C：持牌机构连接器 Fixture 规范（纯模拟 / 不连真实持牌机构）

> **阶段**：S0.5 期间可完整落地本规范 + 所有 fixture；**不连接任何真实持牌机构、不发起任何真实 HTTP 到 Lender Partner、不调用任何真实银行 API、不使用真实 HMAC/RSA 私钥**。
>
> **目的**：
>
> - 为 S1 阶段机构连接器的回调签名校验 / 幂等去重 / 重试 / 状态映射 写好可直接运行的 vitest 契约测试输入
> - 为 S0 桌面演练剧本 2（错误放款回调）提供可复制的 mock 回调日志样本
> - 统一所有未来持牌机构（Lender-A/B/C）的接入契约，不允许一机构一协议

---

## 0. 三域连接器物理隔离（与 S0.2 签字包对齐的 Fixture 边界）

| 域          | 隔离规则（Fixture 严格遵守）                                                                                                      |
| :---------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| Broker 域   | **绝不**存储 Lender 端 `settledAmountMinor` 精确值（只能在 Finance 对账域 diff 里显示）                                           |
| Lender 域   | **绝不**请求 / 暴露 企业 HR 端 `nationalIdFull` / `monthlyBaseSalaryAmountMinor`（只允许 nationalIdLast4 / requestedAmountMinor） |
| Employer 域 | **绝不**访问 持牌机构 私钥 / HMAC / 回调白名单 等配置                                                                             |

---

## 1. 目录结构（`fixtures/connector/`，S0 阶段全部 JSON/TS，不连真接口）

```
fixtures/connector/
├── README.md                 本文件（规范）
├── signing/                  回调签名算法 fixture 输入
│   ├── lender-a-hmac-sha256/
│   │   ├── _keys_placeholder.json   HMAC key 占位，不写真实值（仅写 "hmac_test_only_************************" 结构）
│   │   ├── signed-disburse-callback.valid.json
│   │   ├── signed-disburse-callback.tampered.json    字段被改 → 验签应 FAIL
│   │   ├── signed-disburse-callback.wrong-algo.json  HMAC-SHA1 → 应 FAIL algo 白名单
│   │   └── signed-disburse-callback.stale-timestamp.json  auth_ts > 5min window → FAIL
│   └── lender-b-rsa-pss-sha256/
│       ├── public_key_pem_placeholder.pem （格式占位，绝不是真实 Lender-B 公钥）
│       ├── signed-recon-file.valid.json
│       └── signed-recon-file.bad-sig.json
├── idempotency/              幂等键 fixture 矩阵
│   ├── idem-matrix.success.ts      all 200 + exactly-once 入账
│   ├── idem-matrix.key-mismatch.ts key UUID != callback id
│   └── idem-matrix.24h-ttl.ts      key TTL 过期 → 允许重入（新 key）
├── retries/                  重试 fixture 矩阵（HTTP 状态 × body × 期望行为）
│   ├── retry-policy.disburse-callback.ts
│   └── retry-policy.bank-transfer-failure.ts
├── status-mapping/           状态映射矩阵（Lender 端状态 → PayEase 统一状态）
│   ├── disbursement-status-matrix.ts
│   ├── repayment-status-matrix.ts
│   └── reconciliation-status-matrix.ts
├── samples/                  真实回调日志结构（100% mock 值，字段名与 S1 生产一致）
│   ├── lender-a-disburse-ok.callback.json
│   ├── lender-a-disburse-fail.balance-insufficient.json
│   ├── lender-b-recon-daily.file-sample.json
│   └── lender-c-repayment-paid.callback.json
└── schemas/                  S1 阶段写 Zod schema（S0 仅文档占位）
    └── connector-fixture-schema.zod.ts
```

---

## 2. 回调签名规范（所有 Lender 必须遵循）

### 2.1 Header 字段集（S1 生产严格校验，缺任一 header 直接 401）

```
x-payease-institution-id     LENDER-A | LENDER-B | LENDER-C（白名单 fixture 维护）
x-payease-algo               HMAC-SHA256 | RSA-PSS-SHA512（唯一两种允许，其余 algo=FAIL）
x-payease-signature          hex(HMAC) 或 base64(PSS signature)
x-payease-timestamp-millis   13 位 UTC 毫秒；±300s 窗口之外一律 REJECT
x-payease-idempotency-key    UUID v4；24h TTL；同一个 key 第 2..N 次 → 200（响应缓存） 但不入账
x-payease-request-id         UUID v4；全局唯一；与幂等键 !=
```

### 2.2 签名构造算法（Fixtures 内置 5 条正例/反例）

- **HMAC-SHA256**：`hex( HMAC(key, concat(method '\n' path '\n' timestamp_millis '\n' idempotency_key '\n' sha256_hex(body)) ) )`
- **RSA-PSS-SHA512**：签名内容相同，salt length = 32（fixture 中固定 salt，方便 S1 契约测试可复验）

### 2.3 签名 Fixture 种子（S0 阶段已提供结构占位）

| 文件（位于 `fixtures/connector/signing/lender-a-hmac-sha256/`） | 输入                                                                                             | 期望行为                                                                       |
| :-------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `signed-disburse-callback.valid.json`                           | body=`{ "settledAmountMinor":"125000000","currency":"KHR" }` + 正确 key + 正确 algo + 1min 内 ts | `verifySignature(...) === true`；`parseIdempotency(...) === UNIQUE`；入账 1 次 |
| `signed-disburse-callback.tampered.json`                        | body amountMinor 被从 `"125000000"` 改成 `"999999999"`，signature 未重算                         | `verifySignature(...) === false`；返回 401 `UNAUTH__BAD_SIGNATURE`；不入账     |
| `signed-disburse-callback.wrong-algo.json`                      | algo=`HMAC-SHA1`                                                                                 | `algo white list check FAIL → 400 BAD_REQUEST__UNSUPPORTED_ALGO`               |
| `signed-disburse-callback.stale-timestamp.json`                 | `timestamp_millis - now = 301000ms (>5min)`                                                      | `408 REQUEST__STALE_TIMESTAMP`                                                 |
| `signed-disburse-callback.unknown-institution.json`（新增）     | `x-payease-institution-id=LENDER-X`                                                              | `白名单缺失 → 401 UNAUTH__UNKNOWN_INSTITUTION`                                 |

### 2.4 真实密钥占位（严禁写入真实 HMAC / RSA 私钥）

所有 `fixtures/connector/signing/*/_keys_placeholder.json` / `*.pem` 的内容必须：

- HMAC：`"hmac_test_only_" + "*".repeat(40)`（长度匹配生产，但值恒为星号占位）
- RSA PEM：占位 `-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...<truncated for fixture only>...DAQAB\n-----END PUBLIC KEY-----`（长度占位，不是真实 key）
- 任何 fixture 里出现真实 key → Gitleaks 规则直接 FAIL → CI BLOCK

---

## 3. 幂等键 Fixture 矩阵（防止剧本 2 重复入账 bug）

### 3.1 幂等矩阵（`fixtures/connector/idempotency/idem-matrix.success.ts`，S1 写 vitest）

|                    Fixture Case                     | 幂等键                             |                                         Call 1                                          |             Call 2（<24h，同 key）             |   Call 3（>24h，同 key，key 过期）    | 期望入账次数 |
| :-------------------------------------------------: | :--------------------------------- | :-------------------------------------------------------------------------------------: | :--------------------------------------------: | :-----------------------------------: | :----------: |
|                  Case A：首次成功                   | UUID v4 = `idem-aaaaaaaa-...-0001` |                                       200 + 入账                                        |              200（缓存）但不入账               | 409 IDEM__TTL_EXPIRED，提示生成新 key |   **= 1**    |
|        Case B：首次失败（余额不足，可重试）         | UUID v4 = `idem-aaaaaaaa-...-0002` |                     402 FAIL（body=BALANCE_INSUFFICIENT） → 不入账                      | 402（缓存）；仍不入账；直到换 key 才允许新请求 |         409 IDEM__TTL_EXPIRED         |   **= 0**    |
|                Case C：key 格式错误                 | `"not-a-uuid-v4"`                  |                      400 BAD_REQUEST__INVALID_IDEM_KEY（正则校验）                      |                       —                        |                   —                   |   **= 0**    |
| Case D：两个回调同 key，但 body hash 不同（篡改？） | 同 key，body A / body B hash 不同  | Call 1 入账 → Call 2 → 409 IDEM__BODY_MISMATCH（禁止同 key 不同体，疑似 replay/attack） |                       —                        |         **= 1**，Call 2 0 次          |

### 3.2 幂等 Fixture 的 CI 断言

S1 契约测试必须对上表逐条断言：**入账次数严格等于表格期望值**；任何偏差直接 CI FAIL（对应剧本 2 的重复入账根因修复）。

---

## 4. 重试策略 Fixture 矩阵

### 4.1 指数退避 + 最大 3 次 + 2xx/4xx 停止，5xx 重试

```ts
// fixtures/connector/retries/retry-policy.disburse-callback.ts （S0 阶段仅文档，S1 写 vitest）
export const RETRY_POLICY_DISBURSE_CALLBACK = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoff: "exponential", // 1s, 2s, 4s
  stopStatusCodes: [200, 201, 202, 204, 400, 401, 403, 404, 409, 422],
  retryStatusCodes: [500, 502, 503, 504, 408, 429],
  timeoutPerCallMs: 5000,
} as const;
```

### 4.2 重试 Fixture 列表（每个 Lender 必须至少 1 条）

| Case |  Lender  |              回调 1              |           回调 2           | 回调 3 |            回调 4（超 max）             | 期望                                                 |
| :--- | :------: | :------------------------------: | :------------------------: | :----: | :-------------------------------------: | :--------------------------------------------------- |
| R1   | LENDER-A |           503 → retry            |        502 → retry         | 200 ✅ |                    —                    | 结束，入账 1                                         |
| R2   | LENDER-B |               500                |            504             |  503   | 超 max → 4 次？否 → **只重试到第 3 次** | **最终 FAIL**（剧本 2 对应 Lender 联系人工介入工单） |
| R3   | LENDER-C |          401（Bad Sig）          |             —              |   —    |                    —                    | **立即停止 + 告警**（不重试，疑似攻击）              |
| R4   | LENDER-A | 429 Rate Limit（Retry-After: 5） | 按 header 里的 5s 延迟再发 | 200 ✅ |                    —                    | 结束，入账 1，延迟准确                               |

---

## 5. 状态映射 Fixture 矩阵（Lender 自定义状态 → PayEase 统一枚举）

> **CI-10 金额约束**：所有映射里的金额字段必须是 `{ amountMinor: string; currency: "KHR"|"USD" }` 字符串；任何 Lender 传 number → 映射层直接 FAIL 并审计 RBAC_ACCESS_BLOCKED。

### 5.1 放款状态映射（`fixtures/connector/status-mapping/disbursement-status-matrix.ts`）

| Lender 自定义（原始）                                    | PayEase 统一枚举                                                   | Fixture 样本文件位置                                     |
| :------------------------------------------------------- | :----------------------------------------------------------------- | :------------------------------------------------------- |
| `APPROVED`                                               | `DISBURSE_PENDING`                                                 | samples/lender-a-disburse-ok.callback.json               |
| `IN_PROGRESS` / `SENT_TO_BANK`                           | `DISBURSE_IN_FLIGHT`                                               | —                                                        |
| `SUCCESS` / `PAID_OUT`                                   | `DISBURSE_SETTLED`（→ 触发 finance reconciliation line UNMATCHED） | samples/lender-c-repayment-paid.callback.json            |
| `FAILED__BALANCE_INSUFFICIENT` / `FAILED_LIMIT_EXCEEDED` | `DISBURSE_FAILED`（→ 工单 diff-rc-xxx）                            | samples/lender-a-disburse-fail.balance-insufficient.json |
| `UNKNOWN` / `TIMEOUT`（不映射为成功/失败）               | `DISBURSE_UNKNOWN`（→ 必须人工 2 小时内介入）                      | —                                                        |

### 5.2 对账状态映射（与 Finance 门户 `MOCK_RECON_LINES` 对齐）

| Lender 文件行状态                                     | PayEase Recon 统一状态（5 种）                    | 对应 Finance data-testid badge 颜色 |
| :---------------------------------------------------- | :------------------------------------------------ | :---------------------------------- |
| `MATCHED_BANK`                                        | `MATCHED`                                         | green ✅                            |
| `BANK_MORE_THAN_EXPECTED` / `EXPECTED_MORE_THAN_BANK` | `DIFF_PENDING` → 人工或自动冲正 → `DIFF_RESOLVED` | amber → green                       |
| `NO_CORRESPONDING_BANK_ROW`                           | `UNMATCHED`                                       | red ❌                              |
| `POSTED`                                              | `POSTED_TO_GL`                                    | blue 📒                             |

---

## 6. 样本回调日志（`fixtures/connector/samples/*`）

> 所有值全是 Mock，字段结构真实；绝不出现真实 Lender ID、真实 amountMinor、真实 borrower。

**文件：`lender-a-disburse-ok.callback.json`（示例）**：

```json
{
  "_fixture_note": "100% MOCK, NOT REAL LENDER-A CALLBACK. Use for signature verify + idempotency test only.",
  "institutionPartnerCode": "LENDER-A",
  "loanApplicationRef": "ev-00000000-0000-0000-0000-000000000001",
  "disbursementId": "LENDER-A-DISB-000001",
  "borrowerFullName": "Sok Dara",
  "borrowerBankAccountLast4": "1234",
  "settledMoney": { "amountMinor": "125000000", "currency": "KHR" },
  "disbursementAtUtcMillis": 1786500000000,
  "rawLenderStatusCode": "SUCCESS",
  "auditTraceRef": "L-A-AUD-20260812-000001"
}
```

**文件：`lender-b-recon-daily.file-sample.json`（对账 5 行 fixture）**：

```json
{
  "_fixture_note": "Align with finance MOCK_RECON_LINES: 1 MATCHED + 1 DIFF_PENDING(5 KHR) + 1 UNMATCHED + 1 DIFF_RESOLVED + 1 POSTED_TO_GL",
  "reportDate": "2026-08-12",
  "institutionPartnerCode": "LENDER-B",
  "lines": [
    {
      "loanRef": "ev-00000000-0000-0000-0000-000000000001",
      "expected": { "amountMinor": "125000000", "currency": "KHR" },
      "bank": { "amountMinor": "125000000", "currency": "KHR" },
      "status": "MATCHED_BANK"
    },
    {
      "loanRef": "ev-00000000-0000-0000-0000-000000000002",
      "expected": { "amountMinor": "137500000", "currency": "KHR" },
      "bank": { "amountMinor": "137499995", "currency": "KHR" },
      "status": "EXPECTED_MORE_THAN_BANK"
    },
    {
      "loanRef": "ev-00000000-0000-0000-0000-000000000003",
      "expected": { "amountMinor": "200000000", "currency": "KHR" },
      "bank": { "amountMinor": "0", "currency": "KHR" },
      "status": "NO_CORRESPONDING_BANK_ROW"
    },
    {
      "loanRef": "ev-00000000-0000-0000-0000-000000000004",
      "expected": { "amountMinor": "80000000", "currency": "KHR" },
      "bank": { "amountMinor": "80000000", "currency": "KHR" },
      "status": "MATCHED_BANK"
    },
    {
      "loanRef": "ev-00000000-0000-0000-0000-000000000005",
      "expected": { "amountMinor": "25000000", "currency": "KHR" },
      "bank": { "amountMinor": "25000000", "currency": "KHR" },
      "status": "POSTED"
    }
  ]
}
```

---

## 7. S1 阶段 CI 集成（S0 仅计划，不执行）

1. **签名校验用例**：`vitest` 对 §2.3 5 条 fixture 逐个跑 → 必须全部正确 PASS/FAIL
2. **幂等矩阵**：对 §3.1 Case A/B/C/D 跑 → 入账次数严格等于期望值（用计数器 mock）
3. **重试矩阵**：`msw` (或 mock fetch adapter) 模拟 Lender 返回 §4.2 R1/R2/R3/R4 → 重试次数/延迟序列正确
4. **状态映射**：对 §5.1 5 种状态 + §5.2 5 种对账状态，Zod parse + 映射后枚举正确
5. **金额守卫（CI-10）**：对所有 `samples/*.json` 跑 Grep / Zod：所有 `amountMinor` 为 JS string，且 `/^\d+$/`；任何 number → 直接 FAIL

---

## 8. 签字（冻结 fixture 协议 v1.0）

| 签字方            | 确认项                                                                        | 签字 |    日期    |
| :---------------- | :---------------------------------------------------------------------------- | :--: | :--------: |
| 机构对接负责人    | □ 所有 Lender 实际回调结构都能对应 §2.1 header + §6 body 字段，不做定制化扩展 | ____ | ____/**/** |
| 安全 Owner / CISO | □ 签名 algo 白名单只有 2 种；密钥文件全是占位；窗口 TTL / 幂等 TTL 合规       | ____ | ____/**/** |
| 财务对账负责人    | □ §5 状态映射矩阵与 Finance MOCK_RECON_LINES 完全对齐；颜色标识无歧义         | ____ | ____/**/** |
| 法务              | □ DISBURSE_UNKNOWN 2h 人工 SLA；DIFF_PENDING 工单留痕满足审计要求             | ____ | ____/**/** |
