# Trae 编码交接：用户端 P0 页面化与视觉重构

## 0. 任务目标

将 `user-mini-app` 从单页、长流程展示重构为 Telegram Mini App 内的四个可切换页面，并保留已有的申请、订单、合同确认、账单、补件与客服逻辑。

视觉方向以产品确认的首页截图为准：绿色品牌主色、轻量卡片、金额与期限快捷选择、清晰状态进度；不要把受控 HR/财务演示页面的视觉或 Basic Auth 逻辑复制到用户端。

## 1. 范围与禁止项

允许：

- 修改 `user-mini-app/src/**` 及其测试、样式与本文件关联的验收说明。
- 在同一域内调用现有 `/api/v1/local/public/**` 接口；必须继续使用现有 `applicantRequest`、HttpOnly Cookie、Telegram 会话逻辑。
- 使用现有 `@payease/shared-money` 和字符串最小货币单位。

禁止：

- 新增真实银行、支付、HRIS、持牌机构 SDK 或直连 API。
- 用 `localStorage` 或 `sessionStorage` 保存 token、密码、Telegram `initData`、证件号或用户资料。
- 修改授信、定价、合同、放款、还款核销的决策边界；这些都由持牌机构负责。
- 使用 JavaScript `number` 作为金额 DTO；金额仍为 `{ amountMinor: string, currency }`。
- 在 mock、测试、截图或日志中放入真实姓名、证件号、手机号、工资、账户、合同或资金数据。
- 接触 Terraform、AWS、真实 IdP、HRIS、银行、支付或机构接口；S0.2 红线仍未解除。

## 2. 已有能力：必须复用，不要重写接口

当前 `user-mini-app/src/App.tsx` 已有但没有被清晰页面化的能力：

| 能力                      | 现有公开接口 / 函数                                                                |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Telegram 会话、保活、退出 | `/telegram-sessions`、`/telegram-sessions/keepalive`、`/telegram-sessions/logout`  |
| 语言偏好                  | `/profile/preferred-language`；用户改语言后服务端保存，下次登录恢复                |
| 手机号验证                | `/profile/telegram-phone-verification`；只允许 Telegram `requestContact`，不是 SMS |
| 工厂选择                  | `/employer-tenants`；用户提交前必须选启用工厂                                      |
| 新申请                    | `POST /applications`；已有 `submit()`                                              |
| 订单列表                  | `GET /applications`；已有 `applicationHistory`                                     |
| 订单详情/状态             | `GET /applications/:applicationNo`；已有 `checkStatus()` 与 `summary`              |
| 合同确认                  | `POST /applications/:applicationNo/contract-confirmation`                          |
| 撤回申请                  | `POST /applications/:applicationNo/withdraw`                                       |
| 补件                      | `POST /applications/:applicationNo/supplement-responses`                           |
| 客服/投诉                 | `POST/GET /applications/:applicationNo/service-cases`                              |

不能为了拆页面而新建重复端点或绕开上述鉴权、工厂与状态机守卫。

## 3. 页面与导航（P0）

采用底部四栏导航；不引入第三方路由库，使用 React state 或 URL query 维护当前页面即可。仅 `?page=order-detail&application=<applicationNo>` 可直达订单详情；既有 `?application=<applicationNo>` 保留给原申请状态恢复逻辑，不得改变其含义。

| Tab / 页面              | 必须内容                                                                                | 允许操作                                                              |
| ----------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 首页 `home`             | 申请金额 USD 10–500、期限 7–180 天、工厂选择、Telegram 手机验证状态、申请 CTA、四步进度 | 创建新申请；已存在活跃申请时跳订单详情                                |
| 我的订单 `orders`       | 全部申请列表；状态、申请编号、提交日期、获批额度（存在时）                              | 打开订单详情；不可在列表直接授信/改价                                 |
| 订单详情 `order-detail` | 申请状态、额度、期限、费用展示、工厂显示名、补件、合同确认、放款状态                    | 符合已有状态机才显示确认合同、撤回、补件                              |
| 账单 `repayment`        | 已还/未还期数、总期数、待还、本期、下一还款日、逾期提示、人工还款指引                   | 不创建支付、不调用银行；仅展示并可进入客服                            |
| 个人中心 `profile`      | Telegram 用户状态、手机验证、当前工厂、语言、客服/投诉入口、退出登录                    | 修改语言、发起 Telegram 联系人验证、查看/新增与当前订单关联的客服工单 |

移动端窄屏优先。首页保留截图中的申请卡，而不是将所有功能堆在首屏。

## 4. 用户状态展示规则

- 状态由服务端 `summary.application.status` 决定；前端不得自行将“申请中”变成“获批”。
- 拒绝仅展示持牌机构允许对外的说明及再次申请条件；不展示风控原因、评分、模型、企业核验细节或内部审批意见。
- 账单中的 `paidPeriods`、`unpaidPeriods`、`periodCount`、`outstandingMinor`、`totalPaidMinor`、`overduePeriods`、`nextInstallment` 均只读展示。
- 费用与利率使用机构返回的版本化展示字段；未知时显示“以持牌机构合同/账单为准”，不得前端推算或承诺。
- 客服/投诉必须显示“最终责任由持牌机构承担”的说明，并保留助贷平台受理、催办、工单流转边界。

## 5. 三语与语言记忆

- 全部可见文案必须覆盖 `zh-CN`、`en`、`km`；不可用英文占位冒充高棉语。
- 复用现有服务端语言偏好接口；不把语言偏好写入浏览器敏感存储。
- 账号下次登录默认使用服务端保存的上次语言。
- 测试需验证三个语言对象所有叶子非空，且中文/高棉语不可整体复制英文。

## 6. 建议文件拆分

这是建议，不要求一次性大重构：

```text
user-mini-app/src/
  App.tsx                         # 只负责会话、服务端数据、顶层导航
  pages/
    HomePage.tsx
    OrdersPage.tsx
    OrderDetailPage.tsx
    RepaymentPage.tsx
    ProfilePage.tsx
  components/
    BottomNavigation.tsx
    ApplicationStatusCard.tsx
    MoneyDisplay.tsx
  copy/
    user-copy.ts                  # zh-CN / en / km
  __tests__/
    user-navigation.test.tsx
    user-orders-privacy.test.tsx
    user-repayment-readonly.test.tsx
    user-trilingual-copy.test.ts
```

先抽纯展示组件，再从现有 `App.tsx` 将已有 state 和函数作为 props 下传；不要在第一轮改动 API 模型。

## 7. 验收测试（必须新增）

1. 默认进入首页，底部导航可切换订单、账单、个人中心。
2. 订单列表点击后使用既有 `checkStatus(applicationNo)` 加载详情；不得泄露证件、手机号、风控或企业原始核验资料。
3. 账单页显示已还/未还/下一期；所有金额来自字符串最小货币单位，使用 shared-money 格式化。
4. 不存在账单时显示合规空状态，不虚构还款记录或支付通道。
5. 合同确认、补件、撤回、客服操作只在既有状态允许时出现，并复用现有请求函数。
6. 三语全部非空；用户改语言后调用既有 preferred-language 接口。
7. WEB-08：没有 token/credential/initData/证件号写入 localStorage/sessionStorage。
8. 运行：

```powershell
pnpm format:check
pnpm --filter @payease/user-mini-app run typecheck
pnpm --filter @payease/user-mini-app run test
pnpm --filter @payease/user-mini-app run build
```

## 8. 交付方式

- Trae 先输出：修改文件清单、接口复用说明、测试结果、未解决风险。
- 未经 Codex 复核：不得 `git add`、commit、push、部署。
- Codex 验收后：单独 PR，远程质量与安全门禁绿灯后才允许合并；部署仍须遵守 S0.2 边界。
