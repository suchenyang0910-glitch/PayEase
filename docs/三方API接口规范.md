# 三方 API 接口规范（V1）

## 1. 通用规则

- 协议：HTTPS + mTLS；每个合作方使用独立客户端证书。
- 认证：`X-Client-Id`、`X-Timestamp`、`X-Nonce`、`X-Signature`；签名覆盖请求方法、路径、时间戳、幂等键和请求体哈希。
- 幂等：所有写接口必须携带 `Idempotency-Key`，同键同请求返回同一结果。
- 追踪：响应和异步回调均带 `trace_id`、`event_id`、`schema_version`。
- 敏感资料不放在 JSON、URL、日志或消息体中；用短时、单用途的受控文件引用交付。

## 2. 状态枚举

`DRAFT`、`SUBMITTED`、`DOC_REVIEW`、`NEED_MORE_INFO`、`EMPLOYER_VERIFYING`、`EMPLOYER_VERIFIED`、`LENDER_REVIEWING`、`OFFERED`、`CONTRACTING`、`DISBURSING`、`DISBURSED`、`REPAID`、`OVERDUE`、`CLOSED`、`CANCELLED`。

状态只能按状态机迁移；机构侧结果优先于助贷展示状态。每次迁移生成不可变事件。

## 3. 核心接口

| 调用方 → 接收方 | 接口                                        | 目的                       |
| --------------- | ------------------------------------------- | -------------------------- |
| 助贷 → 企业     | `POST /v1/employment-verifications`         | 发起授权范围内的员工核验   |
| 企业 → 助贷     | `POST /v1/webhooks/employment-verification` | 回传核验结论               |
| 助贷 → 机构     | `POST /v1/loan-applications`                | 提交申请、授权及资料引用   |
| 助贷 → 机构     | `POST /v1/loan-applications/{id}/documents` | 补充资料引用               |
| 机构 → 助贷     | `POST /v1/webhooks/application-status`      | 回传审核状态/原因码        |
| 机构 → 助贷     | `POST /v1/webhooks/offers`                  | 回传不可变报价快照         |
| 机构 → 助贷     | `POST /v1/webhooks/disbursements`           | 回传放款结果               |
| 机构 → 助贷     | `POST /v1/webhooks/bills`                   | 回传账单、还款、冲正事件   |
| 助贷 → 机构     | `POST /v1/consents/{id}/revocation`         | 通知尚未完成申请的授权撤回 |

## 4. 申请提交示例

```json
{
  "application_id": "APP-20260811-000001",
  "trace_id": "tr_01J...",
  "product_code": "SALARY_LOAN_V1",
  "requested_principal_minor": 500000,
  "currency": "KHR",
  "term_count": 6,
  "applicant": {
    "telegram_user_ref": "tg_ref_xxx",
    "id_number_token": "tok_xxx"
  },
  "consent": {
    "consent_id": "con_xxx",
    "version": "2026-08-01",
    "expires_at": "2026-08-18T00:00:00Z"
  },
  "employment_verification": {
    "verification_id": "ver_xxx",
    "status": "VERIFIED"
  },
  "documents": [{ "type": "NATIONAL_ID_FRONT", "secure_ref": "docref_xxx" }]
}
```

## 5. 报价回调要求

机构回传的 `offer_snapshot` 至少包含：机构申请号、报价 ID、币种、本金、期数、名义年利率、适用总成本口径、各费用项及收费主体、实际到账金额、总还款额、每期计划、有效期、合同版本、来源哈希。助贷端验签后原样冻结并供用户确认。

## 6. 错误码与重试

|    HTTP | 业务码                 | 含义                 | 调用方动作             |
| ------: | ---------------------- | -------------------- | ---------------------- |
|     400 | `VALIDATION_ERROR`     | 字段或状态无效       | 修正后使用新幂等键提交 |
| 401/403 | `AUTH_FAILED`          | 签名、证书或权限失败 | 停止重试，触发安全告警 |
|     409 | `IDEMPOTENCY_CONFLICT` | 同键请求体不同       | 人工核查               |
|     422 | `BUSINESS_REJECTED`    | 业务不可处理         | 按原因码更新状态       |
| 429/503 | `RETRYABLE`            | 限流或暂时不可用     | 指数退避，最大 24 小时 |

回调至少重试 12 次；未签收进入死信队列和人工工单。接口变更采用 `/v1` 主版本和 `schema_version` 字段，废弃前至少提供一个发布周期的兼容窗口。
