# PayEase V1 验收与发布门禁

## 适用范围

本清单用于柬埔寨首站、兰海国际作为持牌机构、人工审核/放款/还款核销的 V1 试点。

本文件不批准真实资金、真实用户 PII、真实银行/支付/HRIS 接入。它仅定义代码、测试、配置和人工演练的发布门槛。

## 发布结论规则

- **通过**：所有 P0 项为通过，GitHub Actions 的 quality 与 security workflow 均为绿色，且部署后烟雾测试有记录。
- **不通过**：任一 P0 为失败、跳过、未知，或使用本地 `SKIP` 密钥扫描替代远程真实扫描。
- **条件通过**：不允许用于公开用户入口或真实试点；只能用于明确标识的受控演示环境。

## P0：自动化验收

| 编号 | 验收项               | 权威证据                                                     | 通过条件                                          |
| ---- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| A-01 | 格式、类型、单元测试 | `pnpm format:check`、`pnpm typecheck`、`pnpm test`           | 退出码 0                                          |
| A-02 | PostgreSQL 集成测试  | `pnpm --filter @payease/broker-api run test:integration`     | 退出码 0；不得跳过                                |
| A-03 | 金额与许可证守卫     | `scripts/check-money-type.ps1`、`scripts/check-licenses.ps1` | 退出码 0；金额无 `number` DTO                     |
| A-04 | 远程安全门禁         | GitHub Actions `S0.3 - Local Security Gates`                 | Semgrep、Gitleaks、金额和许可证作业全绿           |
| A-05 | 远程质量门禁         | GitHub Actions `S0 - Shared packages & Gate`                 | format、typecheck、tests、integration、build 全绿 |

建议使用 [run-v1-acceptance.ps1](../scripts/run-v1-acceptance.ps1) 在提交前一次运行 A-01 至 A-03。该脚本必须传入名为 `payease_test` 的一次性 PostgreSQL 测试数据库 URL；不提供 URL 或目标名称不正确会失败而不是静默跳过集成测试。

## P0：业务与安全验收

| 编号 | 场景        | 期望结果                                                                              | 自动化覆盖                                                           |
| ---- | ----------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B-01 | 用户申请    | 已认证用户选择一个启用中的工厂后才可提交                                              | `public-application.integration.test.ts`                             |
| B-02 | 工厂停用    | 选择已停用工厂的提交或后续核验被拒绝                                                  | `public-application.integration.test.ts`                             |
| B-03 | 工厂隔离    | 非所属工厂 HR 不能读取、核验或改写申请，返回 403                                      | `public-application.integration.test.ts`                             |
| B-04 | 员工匹配    | 身份证/护照原文加密；HR 只记录 `MATCHED/NOT_MATCHED`                                  | `personal-profile.test.ts`、`public-application.integration.test.ts` |
| B-05 | 多 Bot 恢复 | 至少两个启用 Bot，停用一个 Bot 后用户可通过另一个 Bot 恢复同一 Telegram 身份资料      | `telegram-auth.test.ts`、`public-application.integration.test.ts`    |
| B-06 | 手机验证    | 每 Bot Webhook 密钥校验、私聊本人联系人校验、转发联系人不可覆盖、未验证用户被门禁拒绝 | `telegram-auth.test.ts`、`public-application.integration.test.ts`    |
| B-07 | 人工审批链  | 助贷审核、持牌初审/终审、合同、放款、还款核销均有角色约束、原因和审计                 | `public-application.integration.test.ts`                             |

## P0：部署前人工检查

1. 每个启用 Telegram Bot 都已设置独立 Webhook URL 和独立 `secret_token`；密钥仅存在部署密钥管理，不在仓库或前端。
2. 对每个启用 Bot 执行一次真实联系人的分享测试，并确认用户手机号验证状态可查询。
3. 仅在全部 Bot Webhook 实测成功后，才允许设置 `REQUIRE_TELEGRAM_PHONE_VERIFICATION=true`。
4. 至少两个启用 Bot 各有合法的 `t.me` 恢复入口；禁用任一 Bot 后，另一个入口仍可登录。
5. 工厂租户、HR/财务账号和成员关系由平台管理员创建；每个首批工厂仅分配自身成员。
6. 检查生产环境没有测试数据库 URL、测试密钥、mock 用户、调试日志或受控预览绕过开关。
7. 首次真实资金流程继续采用指定账号的人工审批、人工放款和人工核销；不得绕过持牌机构最终责任。

## 部署后烟雾测试

在不使用真实 PII/资金的测试账号下记录结果、操作者、时间和截图/审计 ID：

1. 用户从 Telegram 进入，选择语言、工厂、金额和期限，查看提交结果。
2. HR 仅看到本工厂待核验记录，并只记录匹配结果，不显示证件原文。
3. 助贷人员可处理资料审核/补件/工单，但没有授信、定价、放款决定权限。
4. 持牌机构人员按角色完成人工审批、合同、放款确认、账单和核销的模拟闭环。
5. 使用第二个 Bot 重新登录后，用户仍能看到自己的同一申请历史。

## 明确阻断发布的事项

- 安全或质量 GitHub Actions 任一红灯；
- Webhook 密钥未配置、只配置一个 Bot，或未做真实联系人回调验证；
- 任何跨工厂数据访问、身份证/护照明文泄露、金额 `number` DTO；
- 未经法务确认即上线助贷收费、跨境数据、电子签约、KYC/AML、催收话术或留存期；
- 自动连接真实银行、支付、HRIS 或持牌机构系统，而未经过 S0.2 云/权限/合规前置。
