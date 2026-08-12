# S1 预留 · RBAC Fixture 骨架（页面 × 角色 × 动作 → 200/401/403 预期值）

> **阶段**：S0.5 / 等待 S0.2 签字期间可安全落地本 fixture 目录；**不连接任何真实 IdP、不写真实 IAM Policy、不执行任何真实登录/登出操作、不写入任何真实角色绑定**。
>
> **用途**：
>
> - 作为未来 S1.0 MVP API 契约测试（`vitest`/`schemathesis` + `hurl`）的直接输入
> - 作为 [ROLE_RBAC_MATRIX.md](file:///e:/PayEase/docs/ROLE_RBAC_MATRIX.md) 表格的机器可验证版本
> - 作为未来 `playwright` E2E 角色权限回归的数据源（在 S0.2 签字 + Staging 环境就绪后启用）

---

## 1. Fixture 目录结构

```
fixtures/rbac/
├── README.md                 本文件：规范与文件命名
├── _template.json            模板（下文 §2，可复制改值）
├── schemas/
│   └── fixture-schema.zod.ts Zod schema（§3，S1 启动后写 vitest 校验 fixture）
├── 200_ok/                   所有预期 200 的用例
│   ├── hr-verify-portal/     按系统（门户名 / 未来后端服务名）分子目录
│   │   ├── employment-list-view__employer-hr.json
│   │   ├── employment-detail-view__employer-hr.json
│   │   └── employment-approve__employer-hr.json
│   ├── finance-verify-portal/
│   │   ├── reconciliation-list-view__employer-finance.json
│   │   ├── repayment-list-view__employer-finance.json
│   │   └── diff-ticket-create__employer-finance.json
│   ├── broker-admin/
│   │   ├── applications-list-view__broker-officer.json
│   │   └── applications-approve__broker-officer.json
│   ├── ops-admin/
│   │   ├── audit-log-view__ops-admin.json
│   │   └── rbac-role-read__ops-admin.json
│   └── lender-portal/
│       ├── inbox-view__lender-partner.json
│       └── disburse-confirm__lender-partner.json
├── 401_unauthenticated/
│   └── unauthenticated-user__any-role__any-protected-page.json
├── 403_forbidden/            所有预期 403（已登录但越权）的用例
│   ├── employment-list-view__broker-officer.json   （Broker 看 HR 列表 → 403）
│   ├── salary-full-view__broker-officer.json       （Broker 看月薪全文 → 403）
│   ├── bank-account-full__employer-hr.json         （HR 看银行卡全文 → 403）
│   ├── rbac-role-write__employer-finance.json      （财务改角色 → 403）
│   ├── cross-tenant-view__employer-hr.json         （HR A 看 B 企业 → 403）
│   └── cross-domain-broker-lender__any.json        （Broker 跳 Lender URL → 403）
└── fixtures.index.json       自动生成/人工维护，列出所有 fixture 路径（S1 测试运行前 validate）
```

> **禁止事项**（S0 阶段强约束，与 ROLE_RBAC_MATRIX.md 红线一致）：
>
> - fixture 内**绝不**出现真实员工名 / 真实 HR 邮箱 / 真实手机号 / 真实身份证号 / 真实银行卡号 / 真实 Lender Partner ID / 真实 AWS Role ARN
> - fixture 内绝不出现真实 `access_token` / `id_token` / `jwt` / `initData` / `x-api-key`
> - fixture 内绝不出现真实 Staging/Production 的 `baseURL`；所有 URL 必须使用占位 `http://localhost/` 或 `https://<service-name>.mock.invalid/`

---

## 2. Fixture JSON 模板（_template.json，可复制改值）

### 2.1 所有字段定义

```json
{
  "_schema_version": "rbac.payease.io/v1.0",
  "fixture_id": "S1-RBAC-0000",
  "description": "一句话说明：<角色> 在 <页面/API> 执行 <动作> → 预期 <HTTP 状态>",
  "tags": ["hr", "list", "2xx"],
  "security_domain": "employer-hr",
  "actor": {
    "role": "employer-hr",
    "tenant_type": "employer",
    "tenant_id_placeholder": "tenant-employer-AAAAAA",
    "user_id_placeholder": "user-hr-000001"
  },
  "target": {
    "system": "hr-verify-portal",
    "page_or_endpoint": "/employment/list",
    "method": "GET",
    "resource_id_placeholder": "verification-id-000001",
    "action": "view",
    "dual_control_required": false
  },
  "expected": {
    "http_status_code": 200,
    "response_body_presence": "full" | "partial" | "empty" | "redirect",
    "redirect_target_if_302": null,
    "error_code_if_403": "FORBIDDEN__ROLE_OUT_OF_SCOPE" | "FORBIDDEN__CROSS_TENANT" | "FORBIDDEN__DUAL_CONTROL_REQUIRED" | "FORBIDDEN__RED_CARD_FIELD",
    "audit_event_code_if_success": "VIEW_EMPLOYMENT_VERIFICATION_LIST",
    "audit_event_code_if_blocked": "RBAC_ACCESS_BLOCKED"
  },
  "preconditions": [
    "actor 已通过 enterprise IdP SAML 登录（S1 mock 会话）",
    "actor 所在 tenant_id_placeholder = target 资源所在 tenant_id_placeholder （同租户校验）",
    "actor 没有双控审批未通过记录（如有）"
  ],
  "data_classification_notes": {
    "t0_fields_in_response": [],
    "t1_fields_in_response": ["requestedLoanAmountMinor", "nationalIdLast4"],
    "redcard_never_appear_fields": ["monthlyBaseSalaryAmountMinor", "bankAccountNumberFull", "phoneNumberE164Full"]
  },
  "source_matrix_ref": {
    "doc": "docs/ROLE_RBAC_MATRIX.md",
    "section": "§2.3 企业 HR 核验域页面",
    "row_label": "/hr/employment/list 查看本企业待核验列表",
    "cell_expected": "200（本企业）"
  },
  "test_plan_notes_s1": {
    "e2e_playwright": "登录为 mock employer-hr → 访问 /employment/list → 断言 200 并断言 redcard_never_appear_fields 文本不存在",
    "api_contract_hurl": "GET /api/v1/hr/employment/list with cookie mock → 200 + Zod schema parse",
    "ci_blocker": true
  }
}
```

### 2.2 关键字段枚举（与 RBAC 文档一致）

- `security_domain` ∈ `{ broker, lender, employer-hr, employer-finance, ops, shared }`
- `actor.role` ∈ `{ ops-admin, broker-officer, lender-partner, employer-hr, employer-finance, unauthenticated, ci-runner, external-auditor }`
- `target.method` ∈ `{ GET, POST, PUT, PATCH, DELETE }`
- `target.action` ∈ `{ view, create, update, approve, reject, export, sign, rotate, delete, grant_role, revoke_role }`
- `expected.http_status_code` ∈ `{ 200, 201, 204, 302, 401, 403, 404 }`
- `expected.error_code_if_403` ∈
  - `FORBIDDEN__ROLE_OUT_OF_SCOPE` （本矩阵该角色=403）
  - `FORBIDDEN__CROSS_TENANT` （跨企业/跨机构）
  - `FORBIDDEN__DUAL_CONTROL_REQUIRED` （缺第二审批人，见 [AUDIT_EVENT_DICTIONARY.md §2](file:///e:/PayEase/docs/AUDIT_EVENT_DICTIONARY.md)）
  - `FORBIDDEN__RED_CARD_FIELD` （响应包含 [DATA_CLASSIFICATION_DEIDENTIFICATION.md §4 红牌](file:///e:/PayEase/docs/DATA_CLASSIFICATION_DEIDENTIFICATION.md) 的字段）

---

## 3. Zod 校验 Schema（S1 启用后写入 `fixtures/rbac/schemas/fixture-schema.zod.ts`）

> 以下仅定义 schema 语义与代码骨架；**S0 阶段不执行**。S1 启动后写 `vitest`：对 `fixtures.index.json` 中每个 fixture 逐个 parse，格式错直接 CI FAIL。

```ts
// fixtures/rbac/schemas/fixture-schema.zod.ts (S1 落地，当前 S0 仅文档占位)
import { z } from "zod";

const SECURITY_DOMAIN = [
  "broker",
  "lender",
  "employer-hr",
  "employer-finance",
  "ops",
  "shared",
] as const;
const ACTOR_ROLE = [
  "ops-admin",
  "broker-officer",
  "lender-partner",
  "employer-hr",
  "employer-finance",
  "unauthenticated",
  "ci-runner",
  "external-auditor",
] as const;
const HTTP_STATUS = [200, 201, 204, 302, 401, 403, 404] as const;
const ERROR_403_CODE = [
  "FORBIDDEN__ROLE_OUT_OF_SCOPE",
  "FORBIDDEN__CROSS_TENANT",
  "FORBIDDEN__DUAL_CONTROL_REQUIRED",
  "FORBIDDEN__RED_CARD_FIELD",
] as const;

export const RbacFixtureV1Schema = z
  .object({
    _schema_version: z.literal("rbac.payease.io/v1.0"),
    fixture_id: z.string().regex(/^S1-RBAC-\d{4}$/),
    description: z.string().min(10).max(200),
    tags: z.array(z.string().min(2).max(32)).nonempty(),
    security_domain: z.enum(SECURITY_DOMAIN),
    actor: z
      .object({
        role: z.enum(ACTOR_ROLE),
        tenant_type: z.enum(["broker", "lender", "employer", "ops", "none"]),
        tenant_id_placeholder: z.string().regex(/^tenant-[a-z]+-[A-Z0-9]{6}$/),
        user_id_placeholder: z
          .string()
          .regex(/^user-(hr|fin|brk|lend|ops)-\d{6}$/),
      })
      .strict(),
    target: z
      .object({
        system: z.string().regex(/^[a-z0-9-]+$/),
        page_or_endpoint: z.string().startsWith("/"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        resource_id_placeholder: z.string().regex(/^[a-z0-9-]+-\d{6}$/),
        action: z.enum([
          "view",
          "create",
          "update",
          "approve",
          "reject",
          "export",
          "sign",
          "rotate",
          "delete",
          "grant_role",
          "revoke_role",
        ]),
        dual_control_required: z.boolean(),
      })
      .strict(),
    expected: z
      .object({
        http_status_code: z.enum(HTTP_STATUS),
        response_body_presence: z.enum([
          "full",
          "partial",
          "empty",
          "redirect",
        ]),
        redirect_target_if_302: z.union([z.null(), z.string().startsWith("/")]),
        error_code_if_403: z.union([z.null(), z.enum(ERROR_403_CODE)]),
        audit_event_code_if_success: z.string().regex(/^[A-Z_]{3,64}$/),
        audit_event_code_if_blocked: z.string().regex(/^[A-Z_]{3,64}$/),
      })
      .strict(),
    preconditions: z.array(z.string()).nonempty(),
    data_classification_notes: z
      .object({
        t0_fields_in_response: z.array(z.string()),
        t1_fields_in_response: z.array(z.string()),
        redcard_never_appear_fields: z.array(z.string()).nonempty(),
      })
      .strict(),
    source_matrix_ref: z
      .object({
        doc: z.literal("docs/ROLE_RBAC_MATRIX.md"),
        section: z.string().startsWith("§"),
        row_label: z.string().min(5),
        cell_expected: z.string().min(2),
      })
      .strict(),
    test_plan_notes_s1: z
      .object({
        e2e_playwright: z.string().min(20),
        api_contract_hurl: z.string().min(10),
        ci_blocker: z.boolean(),
      })
      .strict(),
  })
  .strict();
```

---

## 4. 已创建的 10% 种子 Fixture（示例，S0 阶段提供可复制模板）

### 4.1 200 OK：HR 看 HR 核验列表

复制 §2 模板为 `fixtures/rbac/200_ok/hr-verify-portal/employment-list-view__employer-hr.json`，填值：

- `fixture_id = "S1-RBAC-0001"`
- `actor.role = "employer-hr"`
- `target.system = "hr-verify-portal"`, `page_or_endpoint = "/employment/list"`, `method = "GET"`, `action = "view"`
- `expected.http_status_code = 200`, `response_body_presence = "partial"`, `redcard_never_appear_fields = ["monthlyBaseSalaryAmountMinor", "phoneNumberE164Full"]`
- `source_matrix_ref.section = "§2.3 企业 HR 核验域页面"`

### 4.2 403 Forbidden：Broker 看 HR 月薪全文（红牌）

复制到 `fixtures/rbac/403_forbidden/salary-full-view__broker-officer.json`：

- `fixture_id = "S1-RBAC-9001"`
- `actor.role = "broker-officer"`, `target.page_or_endpoint = "/api/v1/hr/employment/:id?expand=monthlyBaseSalary"`
- `expected.http_status_code = 403`, `error_code_if_403 = "FORBIDDEN__RED_CARD_FIELD"`
- `redcard_never_appear_fields = ["monthlyBaseSalaryAmountMinor"]` 必须响应 403，不得带 T0 字段
- `source_matrix_ref.section = "§2.2 助贷/运营域页面"`

### 4.3 401 Unauthenticated：未登录访问任何受保护页面

复制到 `fixtures/rbac/401_unauthenticated/unauthenticated-user__any-role__any-protected-page.json`：

- `fixture_id = "S1-RBAC-0000"`
- `actor.role = "unauthenticated"`
- `target.page_or_endpoint = "/employment/list"`（+ 后续每个受保护路由各 1 份）
- `expected.http_status_code = 401` or `302` → `redirect_target_if_302 = "/login"`

---

## 5. Fixture 索引与 S1 阶段 CI 接入（不越线，仅计划）

```
fixtures/rbac/fixtures.index.json  (S1 阶段写 validate 脚本生成)
{
  "index_version": "1.0",
  "generated_at": "2026-__-__T__:__:__+07:00",
  "total_fixtures_by_expected": {
    "200_2xx": 0,
    "401": 0,
    "403": 0,
    "total": 0
  },
  "roles_coverage_pct": { "ops-admin": 0, "broker-officer": 0, "lender-partner": 0, "employer-hr": 0, "employer-finance": 0 },
  "paths": [ "fixtures/rbac/200_ok/..." ]
}
```

S1 阶段（S0.2 签字 + Staging 就绪后）步骤：

1. `vitest -t "RBAC Fixture schema parse"` → 每个 JSON 用 §3 Zod schema 校验，任何格式错 CI FAIL
2. `hurl --test fixtures/rbac/**/*.hurl` → 用 actor mock cookie/session 调用真实 API 断言 status + error_code
3. `playwright` → E2E 角色切换，抓取 full page text，全局 grep 红牌字段（`monthlyBaseSalaryAmountMinor`、`bankAccountNumberFull`、`phoneNumberE164Full`、`nationalIdFull`） → 命中直接 FAIL
4. 覆盖率指标：每个 `(角色 × 页面/API × 动作)` 必须至少 1 份 fixture，覆盖率 100% 方可允许 S1.0 GA

---

## 6. 签字（冻结 v1.0 schema）

> S0.2 签字完成后，本文件 schema 与 _template.json 正式打 tag = `rbac-fixture-v1.0`；之后任何字段修改必须通过 PR + CISO + 产品 Owner 双审。

| 签字方            | 确认                                                                                          | 签字               | 日期       |
| :---------------- | :-------------------------------------------------------------------------------------------- | :----------------- | :--------- |
| 安全 Owner / CISO | □ 所有 redcard_never_appear_fields 与 DATA_CLASSIFICATION_DEIDENTIFICATION.md §4 一致；无遗漏 | __________________ | ____/**/** |
| 产品 Owner        | □ 所有 200/401/403 映射与 ROLE_RBAC_MATRIX.md 表格 100% 对齐；无业务动作遗漏                  | __________________ | ____/**/** |
| 基础设施 Owner    | □ §3 Zod schema 可直接在 CI vitest 中 parse；fixture 路径结构便于 playwright/hurl 读取        | __________________ | ____/**/** |
| 法务              | □ 401/403 错误码对外话术符合柬埔寨 e-commerce / PII 法律要求；不泄露内部系统信息              | __________________ | ____/**/** |
