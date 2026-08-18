# Trae 编码交接：PayEase V1

## 1. 当前基线

- 仓库：`git@github.com:suchenyang0910-glitch/PayEase.git`
- 分支：`main`
- 最新提交：`4076ecc fix: allow Telegram webhook verification routes`
- 不要重写历史；所有改动使用小粒度提交，并在提交前运行本文件列出的测试。
- 当前远程 Actions 已确认通过格式检查、严格类型检查、单元测试与 PostgreSQL 集成测试；构建步骤以 GitHub Actions 的最终结果为准。

## 2. 已确认的 V1 业务规则（不可自行弱化）

1. **一座工厂 = 一个独立企业租户**。租户边界同时限制数据读取、HR 核验、财务对账和后台账号成员关系。
2. 用户提交借款申请时必须选择一个**启用中的工厂**；生产认证模式缺少 `employerTenantId` 必须返回 `422 EMPLOYER_TENANT_REQUIRED`。
3. 员工匹配主键为身份证号或护照号：`NATIONAL_ID | PASSPORT`。
4. 证件号必须加密保存；用于匹配的值使用独立 HMAC lookup key。不得在日志、审计 payload、通知、浏览器或 HR 列表中输出证件号或 HMAC。
5. HR 只可对所属工厂的申请记录 `MATCHED` 或 `NOT_MATCHED`，不能查看证件号、手机号或其他工厂数据。
6. V1 金额范围 USD 10–500，期限 7–180 天；金额传输字段始终为 `amountMinor: string` + `currency`，不得使用 JS `number`。
7. 所有用户端、助贷端、持牌机构端、HR/财务端必须支持高棉语、英语、中文；账号选择的语言应在后续登录默认恢复。

## 3. Telegram 多 Bot 与手机号验证

### 已实现

- 多 Bot 配置：`TELEGRAM_BOTS_JSON`，每个 Bot 含 `botId`、`botToken`、`enabled`、`entryUrl`、可选 `webhookSecret`。
- 生产恢复拓扑要求至少两个启用且具有 `entryUrl` 的 Bot。
- 用户身份主键为 `telegram-{telegramUserId}`，不会因某一个 Bot 停用而丢失用户资料。
- Telegram 电话验证使用用户主动共享联系人（`Telegram.WebApp.requestContact`），**不是 SMS 验证**。
- 回调接口：`POST /v1/local/internal/telegram-bot-updates/:botId`。
  - 必须验证 `X-Telegram-Bot-Api-Secret-Token`；
  - 只接受私聊、且 `contact.user_id === message.from.id` 的联系人；
  - 转发联系人或群聊联系人仅返回 `204`，不得覆盖既有已验证手机号；
  - 不使用后台管理员会话，也不使用 CSRF；它有独立的每 Bot 密钥认证。
- 手机状态：`GET /v1/local/public/profile/telegram-phone-verification`，由 Telegram 用户会话认证。
- 当 `REQUIRE_TELEGRAM_PHONE_VERIFICATION=true` 时，未验证手机号的申请返回 `422 TELEGRAM_PHONE_VERIFICATION_REQUIRED`。
- 部署前检查在开启此门禁时会要求每个启用 Bot 有合法 `webhookSecret`。

### Trae 不得遗漏的生产配置

对每一个启用 Bot 都要调用 Telegram `setWebhook`，Webhook URL 形如：

```text
https://<api-domain>/v1/local/internal/telegram-bot-updates/<botId>
```

并为该 Bot 设置独立、随机、16–128 位的 `secret_token`，其值只保存于部署密钥配置中的 `TELEGRAM_BOTS_JSON.webhookSecret`。不得把 Bot token 或 webhook secret 写入仓库、前端环境变量、日志或截图。

在所有 Bot 的 Webhook 实测成功前，不得将 `REQUIRE_TELEGRAM_PHONE_VERIFICATION` 设为 `true`。

## 4. 重点代码位置

| 目标                                                  | 文件                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API 路由、租户隔离、申请提交、Webhook                 | `broker-api/src/server.ts`                                                                                                                                                |
| Telegram Bot 配置、initData、Webhook 密钥与联系人证明 | `broker-api/src/telegram-auth.ts`                                                                                                                                         |
| Telegram 认证/手机号门禁策略                          | `broker-api/src/telegram-auth-policy.ts`                                                                                                                                  |
| 部署前安全校验                                        | `broker-api/src/deployment-preflight.ts`                                                                                                                                  |
| 申请输入验证                                          | `broker-api/src/validation.ts`                                                                                                                                            |
| 用户端电话验证 UI                                     | `user-mini-app/src/App.tsx`、`user-mini-app/src/telegram-phone-contact.ts`                                                                                                |
| 工厂/证件匹配约束                                     | `docs/06-接口与集成/EMPLOYMENT_IDENTITY_MATCH_BOUNDARY.md`                                                                                                                |
| 数据库迁移                                            | `broker-platform/db/migrations/V0026__employer_tenants_and_identity_documents.sql`、`V0027__employment_identity_match_gate.sql`、`V0028__telegram_phone_verification.sql` |

## 5. 建议 Trae 后续编码顺序

1. 完成用户端“选择工厂 → 填个人资料/证件 → 提交 → 查询申请状态”的视觉和交互优化，复用现有 API，不绕过工厂选择和 Telegram 会话。
2. 完成助贷后台的资料审核、补件、企业核验催办、异常工单、客服/投诉、对账；禁止实现授信、定价、放款决策。
3. 完成持牌机构后台的部门—角色—账号管理、人工审批链、授信/合同/放款/还款核销审批；操作必须可审计、可配置字段可见范围。
4. 为每项新路由补充单元测试和 PostgreSQL 集成测试，特别是跨工厂 403、跨角色 403、重复回调幂等、金额字符串和审计不可修改。
5. 在真实接口接入前保持人工审核、人工放款、人工还款核销模式；不得擅自接入银行、HRIS、支付或持牌机构真实 SDK。

## 6. 必跑验证

```powershell
cd E:\PayEase
pnpm format:check
pnpm typecheck
pnpm test

# 本机 PostgreSQL 可用时：
$env:PAYEASE_TEST_DATABASE_URL = "postgresql://..."
pnpm --filter @payease/broker-api run test:integration
```

任何失败必须先修复再提交。GitHub Actions 的 quality gate 和 security gate 是远程最终验收依据。

## 7. 明确禁止项

- 禁止删除或绕过工厂租户隔离、身份证/护照加密与 HMAC 匹配、Telegram 多 Bot 恢复机制。
- 禁止使用 localStorage 保存 token、session、initData、Webhook secret 或 Bot token。
- 禁止把金额改为 `number`。
- 禁止在未取得云账号/区域/权限矩阵和合规确认前写 Terraform 或接入真实 AWS、银行、HRIS、支付或持牌机构。
- 禁止将真实客户 PII、真实密钥、真实合同或真实资金数据作为 mock/fixture 提交。
