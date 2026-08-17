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

### A-06：S0.5 静态演示产物隔离审查（仅受控演示环境）

对于 `agent/s0-5-static-demo` 分支或任何包含 S0.5 静态演示门户的提交，需在 A-01~A-03 通过后，**使用合成数据**单独运行以下演示验收，再允许将其视为 "条件通过（受控演示）"。**A-06 通过不会解锁真实用户 / 真实 PII / 真实资金 / 真实银行接口的发布。**

- 运行命令：
  - `scripts\build-demo-portals.cmd`（Windows）或同等跨平台 bash 脚本
  - `pnpm --filter @payease/hr-verify-portal run test`
  - `pnpm --filter @payease/finance-verify-portal run test`
- 审查步骤 **仅限合成数据（`DEMO-EMP-001` / `DEMO-LEDGER-*` / `DEMO-RECON-*` / `LENDER-A/B/C` / `EMP-YYYY-NNNN` / `ev-00000000*` / `rp-00000000*` / `rc-*` 等模板占位符）**，不得引入真实 PayEase 员工、客户、合作伙伴或任何真实国家身份证 / 护照 / E.164 手机号 / MoPF 税号 / 银行账号 / 稳定币地址；同时不得在 demo 源码或 dist assets 中嵌入 `Sok Dara`、`Chea Srey Mom` 这类真实姓名样本（即便被"举例"）：
  1. 构建产物 `dist-demo/hr-verify-portal.zip` + `finance-verify-portal.zip` 仅包含静态 HTML/CSS/JS 与合成 mock（Vite build:demo 打包 DemoApp 单入口）；
  2. 构建脚本 Step 4 **Network-Zero 扫描**（范围与 `build-demo-portals.cmd` 严格一致）：
     - 源码层仅扫 **单文件**：`hr-verify-portal/src/pages/DemoApp.tsx` 与 `finance-verify-portal/src/pages/DemoApp.tsx`（不扫普通门户页面，不扫 shared packages，不扫 mocks）；
     - 禁止源码中出现 `fetch(` / `axios` / `WebSocket(` / `XMLHttpRequest` / `navigator.sendBeacon` / 真实银行与支付域名（`.ababank.com` / `wingmoney.com` / `acledabank.com.kh` / `stripe.com` / `payway.com.kh`）/ 真实 HRIS/ERP 域名与产品（`sap.` / `oracle.com` / `quickbooks` / `xero`）；
     - dist 层再扫 `hr-verify-portal/dist/assets/*.js` 与 `finance-verify-portal/dist/assets/*.js`：禁止 `/api` 相对路径、禁止 `nationalIdLast4` / `monthlyBaseSalary` / `borrowerName` 等 PII 字段名、禁止任何真实柬埔寨姓名样本（`Sok Dara` / `Chea Srey Mom` 等）；
  3. 构建脚本 Step 5 **CI-10 amountMinor STRING 断言** 通过：`hr-verify-portal/dist/assets/*.js` 与 `finance-verify-portal/dist/assets/*.js` 中 `amountMinor:<JS_NUMBER_LITERAL>` 正则必须 0 命中；
  4. 三语文案（中文 / 英文 / 高棉语）的所有叶子字段均为非空字符串，且 zh-CN 与 km ≥ 75% 的叶子字段与 en 不同，避免"名义多语实际未本地化"；同时 `HR_DEMO_COPY` 与 `FINANCE_DEMO_COPY` 必须直接从对应门户的 `src/pages/DemoApp.tsx` 导出，测试不得再复制另一份文案；
  5. 演示 Vitest 全部通过：
     - HR 门户仅显示核验引用与匹配结果，不渲染身份证号、护照号、手机号、真实薪资字面量、真实 MoPF 税号等合成 PII token；
     - 财务门户不渲染借款人姓名、支付渠道或银行信息；
     - 语言切换器仅持久化 `payease-demo-language` 一个存储键，且 `localStorage / sessionStorage.setItem` 写入任何 credential/token/password/secret/jwt/id_token/access_token/refresh_token/nonce/initData 会被 test-setup.ts 的 WEB-08 patch 立即抛出；
     - Network-ZERO 全局 patch 在 beforeAll 生效：`fetch / XMLHttpRequest / WebSocket / navigator.sendBeacon` 访问 data://localhost/file:* 之外一律抛 `[S0.5-NETWORK-ZERO]`。
- 归档：审查通过后记录操作者、时间与 commit SHA，作为 S0.5 受控演示环境放行记录；该记录不能替代 §4 上线红线 12 项。
- **明确禁止用 A-06 的 demo 产物做以下动作**：接入真实云账号或与 broker-prod / lender-prod / employer-prod 三域 VPC peering；挂真实 SSO / OIDC / SAML / SCIM；上传真实 PII 或真实工资单 / 银行对账单 / Stripe PayWay CSV；复用 demo 的 TLS 证书 / SSH host key / htpasswd 进入 S1 Staging 或 Prod（S0.2 签字后必须重建）。

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
