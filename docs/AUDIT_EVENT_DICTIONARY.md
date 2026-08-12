# S1 预留 · 审计事件字典（Audit Event Dictionary Schema）

> **阶段**：S1.0 MVP 前置定义。本文件仅定义 Zod/TS schema 语义、字段命名与保留事件 code；**不落任何真实数据库、不写入真实审计事件、不连接任何 SIEM/S3 归档桶**。
>
> **写入真实审计事件的前提**：
>
> 1. S0.2 `SECURITY_S0_2_CHECKLIST.md` PART 3（KMS CMK 别名 `alias/broker-prod/rds-pii` + `alias/shared-services/s3-audit`）已签字
> 2. 共享服务账号 `payease-shared-services` 的 CloudTrail organization trail + S3 归档桶已创建且启用 MFA Delete
> 3. 事件 schema 在此文件冻结（v1.0.0 打 tag）并通过 DPO + CISO 复核
>
> **三域隔离原则**：
>
> - 助贷域（broker）事件写入 `audit/broker/*` 前缀
> - 机构域（lender）事件写入 `audit/lender/*` 前缀
> - 企业域（employer）事件写入 `audit/employer/hr/*` 与 `audit/employer/finance/*`
> - 任一域的事件消费者不可 `s3:GetObject` 到其他域前缀（S3 bucket policy + IAM 双约束）

---

## 1. 通用 Audit Envelope（Zod schema 草案，S1 落地）

```ts
import { z } from "zod";

export const AUDIT_EVENT_V1_VERSION = Object.freeze({
  major: 1,
  minor: 0,
  patch: 0,
});

export const AuditEventCodeV1Enum = z.enum([
  /* 认证与会话 */
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILURE",
  "AUTH_LOGOUT",
  "AUTH_MFA_CHALLENGE_ISSUED",
  "AUTH_MFA_CHALLENGE_VERIFIED",
  "AUTH_SESSION_EXPIRED",
  "AUTH_CROSS_ORIGIN_REDIRECT_BLOCKED",

  /* 查看类（Read） — 含敏感字段访问 */
  "VIEW_EMPLOYMENT_VERIFICATION_LIST",
  "VIEW_EMPLOYMENT_VERIFICATION_DETAIL",
  "VIEW_REPAYMENT_LIST",
  "VIEW_RECONCILIATION_BATCH",
  "VIEW_RECONCILIATION_DIFF_LINE",
  "VIEW_BORROWER_PII_FULL",
  "VIEW_SALARY_FULL_AMOUNT",
  "VIEW_BANK_ACCOUNT_MASKED",
  "VIEW_BANK_ACCOUNT_FULL", // 极高敏，需双控

  /* 核验 / 动作类（Write） */
  "HR_VERIFICATION_APPROVED",
  "HR_VERIFICATION_REJECTED",
  "HR_VERIFICATION_EXPIRED",
  "HR_VERIFICATION_DISPUTE_RAISED",
  "HR_VERIFICATION_DISPUTE_RESOLVED",
  "BROKER_APPLICATION_APPROVED",
  "BROKER_APPLICATION_REJECTED",
  "LENDER_LOAN_DISBURSEMENT_CONFIRMED",
  "LENDER_REPAYMENT_SETTLEMENT_RECEIVED",
  "FINANCE_RECON_DIFF_WORKFLOW_CREATED",
  "FINANCE_RECON_DIFF_WORKFLOW_RESOLVED",
  "FINANCE_GL_POST_BATCH_TRIGGERED",

  /* 导出（极敏，强制双控） */
  "EXPORT_HR_VERIFICATION_CSV",
  "EXPORT_REPAYMENT_CSV",
  "EXPORT_RECON_DIFF_EXCEL",
  "EXPORT_GL_VOUCHER_PDF",
  "EXPORT_BORROWER_PII_BATCH", // 法务 + DPO 双审批

  /* 权限与角色变更（强制双控） */
  "RBAC_ROLE_CREATED",
  "RBAC_ROLE_UPDATED",
  "RBAC_ROLE_DELETED",
  "RBAC_USER_ROLE_BOUND",
  "RBAC_USER_ROLE_UNBOUND",
  "TENANT_CREATED",
  "TENANT_MEMBER_ADDED",
  "TENANT_MEMBER_REMOVED",

  /* 安全 / 密钥 / 合规 */
  "KMS_KEY_ROTATION_MANUAL_TRIGGERED",
  "KMS_KEY_SCHEDULED_DELETION", // 极高敏
  "KMS_KEY_DELETION_CANCELLED",
  "KMS_POLICY_CHANGED",
  "CERTIFICATE_AUTHORITY_ROOT_ROTATED",
  "CERTIFICATE_REVOKED_BY_OWNER",
  "WEBHOOK_SIGNATURE_KEY_ROTATED",
  "NETWORK_ZERO_BLOCKED_FETCH", // 从 S0.5 test-setup 升级的生产告警事件
  "STORAGE_TOKEN_KEY_BLOCKED", // WEB-08 localStorage 违规告警
  "DPI_EXPORT_DENIED", // 数据分类越权访问拦截
  "CSP_VIOLATION_REPORT",
  "HSTS_PRELOAD_ENROLLED",
  "SEMGREP_BLOCKING_HIT",
  "GITLEAKS_SECRET_DETECTED",

  /* 系统 / 运维（OPS 域） */
  "DEPLOYMENT_STARTED",
  "DEPLOYMENT_SUCCEEDED",
  "DEPLOYMENT_ROLLED_BACK",
  "DB_MIGRATION_RUN",
  "DB_MIGRATION_FAILED",
  "FEATURE_FLAG_CHANGED",
  "TERRAFORM_APPLY_PENDING_APPROVAL",
  "TERRAFORM_APPLY_APPROVED",
  "TERRAFORM_APPLY_REJECTED",

  /* 桌面演练事件（S0.5 预研，不真实触发） */
  "TABLETOP_KEY_LEAK_SIMULATED",
  "TABLETOP_WRONG_DISBURSE_CALLBACK_SIMULATED",
  "TABLETOP_ACCOUNTING_IMBALANCE_SIMULATED",
  "TABLETOP_PII_UNAUTHORIZED_ACCESS_SIMULATED",
]);

export type AuditEventCodeV1 = z.infer<typeof AuditEventCodeV1Enum>;

const CURRENCY = ["KHR", "USD"] as const;

export const AuditEventV1EnvelopeSchema = z.object({
  schemaVersion: z.literal("audit.payease.io/v1.0"),
  id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }), // UTC+7 带 offset，无时区模糊
  eventCode: AuditEventCodeV1Enum,
  outcome: z.enum(["SUCCESS", "FAILURE", "BLOCKED", "SIMULATED"]),
  severity: z.enum(["DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL"]),
  actor: z.object({
    id: z.string().max(128), // 永不写真实邮箱/手机号；使用内部 opaque user_id
    role: z.enum([
      "ops-admin",
      "broker-officer",
      "lender-partner",
      "employer-hr",
      "employer-finance",
      "system",
      "ci-runner",
      "external-auditor",
    ]),
    tenantId: z.string().max(128).optional(), // 企业/机构域才填；broker/ops 不填
    ipAddress: z.string().ip().optional(), // 可选，合规存 90 天自动清理
    userAgentHash: z.string().max(64).optional(), // SHA-256 截断，不写 UA 原文，防 fingerprint
    mfaPassed: z.boolean().optional(),
  }),
  target: z.object({
    domain: z.enum([
      "broker",
      "lender",
      "employer-hr",
      "employer-finance",
      "shared",
    ]),
    resourceType: z.enum([
      "application",
      "employment-verification",
      "repayment",
      "recon-batch",
      "recon-line",
      "user",
      "role",
      "tenant",
      "kms-key",
      "certificate",
      "webhook-key",
      "export-file",
      "deployment",
      "db-migration",
      "feature-flag",
      "tf-apply",
    ]),
    resourceId: z.string().max(256),
  }),
  context: z
    .object({
      requestId: z.string().max(128).optional(),
      sessionId: z.string().max(128).optional(), // session 内部 id，永不泄露到前端
      ipCountry: z
        .enum([
          "KH",
          "SG",
          "TH",
          "VN",
          "ID",
          "MY",
          "PH",
          "CN",
          "JP",
          "AU",
          "US",
          "EU",
          "OTHER",
        ])
        .optional(),
      locationRegion: z
        .enum(["ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "shared"])
        .optional(),
      userAgentClientHint: z
        .enum(["desktop", "mobile", "tablet", "bot", "unknown"])
        .optional(),
      dualControlApproverUserId: z.string().max(128).optional(), // 双控事件（导出/删密钥/权限变更）
      // 金额类事件上下文（CI-10：恒为字符串最小单位，不写 JS number）
      money: z
        .object({
          amountMinor: z.string().regex(/^\d+$/),
          currency: z.enum(CURRENCY),
        })
        .optional(),
      moneyDelta: z
        .object({
          amountMinor: z.string().regex(/^-?\d+$/),
          currency: z.enum(CURRENCY),
        })
        .optional(),
      // 备注：自由文本，极敏字段必须先通过 data-classification dict 脱敏再写入
      noteTruncatedSha256: z.string().length(64).optional(), // 原文 + 哈希备查，原文落独立 KMS 加密桶
    })
    .strict(), // 不允许任意扩展字段；避免有人偷偷塞 PII
});

export type AuditEventV1Envelope = z.infer<typeof AuditEventV1EnvelopeSchema>;
```

---

## 2. 强制双控事件清单（Dual-Control Mandatory）

> 以下事件必须 `context.dualControlApproverUserId` 非空；否则直接审计失败并 BLOCKED，业务落库动作必须先 rollback。

| eventCode                               | 说明              | 第一执行人（role）         | 第二审批人（role，必须不同人）  |
| :-------------------------------------- | :---------------- | :------------------------- | :------------------------------ |
| `RBAC_ROLE_CREATED / UPDATED / DELETED` | 角色级变更        | ops-admin                  | 第二 ops-admin（≠ 本人）        |
| `RBAC_USER_ROLE_BOUND / UNBOUND`        | 用户绑解绑        | ops-admin                  | 第二 ops-admin（≠ 本人）        |
| `TENANT_CREATED`                        | 创建企业/机构租户 | ops-admin                  | 安全 Owner 或 CISO              |
| `EXPORT_BORROWER_PII_BATCH`             | 批量导出 PII      | ops-admin / broker-officer | 法务 + DPO 双审                 |
| `KMS_KEY_SCHEDULED_DELETION`            | 计划删 CMK        | 安全 Owner                 | 第二安全 Owner 或 CISO          |
| `CERTIFICATE_REVOKED_BY_OWNER`          | 紧急吊销证书      | Emergency Revoker          | 法务复核（1h 内补签）           |
| `FINANCE_GL_POST_BATCH_TRIGGERED`       | 总账过账批次触发  | employer-finance           | 第二 employer-finance（≠ 本人） |

---

## 3. S1 审计事件写入前置 Checklist（待 S0.2 签字后逐项打勾）

- [ ] PART 3 KMS `alias/shared-services/s3-audit` CMK 已创建，Key Owner = CISO
- [ ] CloudTrail org trail 已启，管理事件 + 数据事件（S3/Lambda）全量
- [ ] 三域各域 Kinesis Firehose → 共享服务 S3 归档桶跨域 AssumeRole 仅允许 PutRecord，不允许 Get/List/Delete
- [ ] S3 归档桶启用：版本化 + MFA Delete + Object Lock（Compliance 模式，最短 7 年）+ 默认 AES-KMS 加密
- [ ] 审计事件落库前通过数据分类字典脱敏（见 `DATA_CLASSIFICATION_DEIDENTIFICATION.md`）
- [ ] 任何 eventCode 升级 / 降级必须通过 PR 并 CISO 签字（本文件 git tag 冻结）
- [ ] 桌面演练 4 类 TABLETOP_* 事件可触发但前缀为 `outcome=SIMULATED`，不进入真实告警 pipeline

---

**签字（Schema v1.0 冻结基线）**：

| 签字方            | 确认                                          | 签字               | 日期       |
| :---------------- | :-------------------------------------------- | :----------------- | :--------- |
| 安全 Owner / CISO | □ eventCode 覆盖全面；双控事件清单无遗漏      | __________________ | ____/**/** |
| 合规 / DPO        | □ 上下文字段无 PII 明文泄露风险；脱敏流程通过 | __________________ | ____/**/** |
| 产品 Owner        | □ 业务动作与 eventCode 一一映射无遗漏         | __________________ | ____/**/** |
| 基础设施 Owner    | □ 落库链路（Kinesis/S3/CMK）可按本文件落地    | __________________ | ____/**/** |
