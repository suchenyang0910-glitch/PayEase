# Trae V1 T02：字段字典与数据边界

**任务类型**：契约、DTO、校验与脱敏。**禁止**：跨域共享主键、金额 number、PII 明文日志。

## 通用约束

- 金额：`amountMinor: string` + `currency: "USD"`；只在领域层使用精确十进制运算。
- 时间：ISO 8601 UTC；业务日期另用 `YYYY-MM-DD`。
- 所有原始证件号、银行卡号、照片、活体/签名文件均加密存储；列表只返回掩码/引用。
- Broker 与 Lender 使用各自 UUID；跨域只传 `externalApplicationRef`、`externalWalletRef`、事件 ID。

## 用户与 KYC

| 字段                                | 类型     | 权威域 | 对 Mini App  | 规则                                       |
| ----------------------------------- | -------- | ------ | ------------ | ------------------------------------------ |
| telegramProfile                     | 受控对象 | Broker | 可读受控字段 | avatarUrl、displayName、username；验签来源 |
| preferredLanguage                   | km/en/zh | Broker | 可读写       | 下次登录恢复                               |
| verifiedPhoneRef                    | string   | Broker | 状态可读     | 不返回手机号原文                           |
| identityDocumentType                | enum     | Broker | 可写         | `NATIONAL_ID` / `PASSPORT`                 |
| identityDocumentEncryptedRef        | string   | Broker | 不可读       | 加密对象引用                               |
| identityLookupHmac                  | string   | Broker | 不可读       | 仅服务端匹配                               |
| recentPhotoRef / livenessCaptureRef | string   | Broker | 不可读       | 人工复核证据引用                           |
| employerTenantId                    | string   | Broker | 可写         | 一家工厂一个租户                           |
| contacts                            | 加密数组 | Broker | 可写         | 至少两位；不向企业展示                     |

## 授信、借款与合同

| 字段                         | 类型   | 权威域             | 规则                                  |
| ---------------------------- | ------ | ------------------ | ------------------------------------- |
| limitSuggestionMinor         | string | Broker 内部建议    | 默认可为 USD 50；不向用户等同正式额度 |
| approvedLimitMinor           | string | Lender             | 仅持牌机构最终写入                    |
| requestedAmountMinor         | string | Broker             | USD 10–500 且不超可用额度             |
| contractualTermDays          | enum   | Lender             | `15` / `30`                           |
| purposeCode                  | enum   | Broker/Lender 契约 | 禁止房产、证券、赌博等用途            |
| recipientBankName            | string | Lender 加密字段    | 放款收款银行                          |
| recipientAccountEncryptedRef | string | Lender             | 不回传完整卡号                        |
| accountHolderName            | string | Lender             | 与 KYC 规则校验                       |
| agreementVersionRef          | string | 各自权威域         | 每次确认冻结版本                      |
| signatureEvidenceRef         | string | Lender             | 用户采集后回传并验收                  |

## 钱包、提现与还款

| 字段                         | 类型   | 权威域               | 规则                                          |
| ---------------------------- | ------ | -------------------- | --------------------------------------------- |
| walletExternalRef            | string | Lender               | Broker 仅保存投影引用                         |
| availableBalanceMinor        | string | Lender               | 仅验签事件后更新                              |
| withdrawalAmountMinor        | string | Lender               | 不得超可提现余额                              |
| payoutBankAccountToken       | string | Lender/支付方        | 银行卡令牌，不传完整账号                      |
| payoutAccountMasked          | string | Lender 投影          | 只展示末四位                                  |
| paymentPinHashRef            | string | Lender               | Broker 不保存、不重置                         |
| paymentOrderRef              | string | Lender               | 支付机构订单引用                              |
| callbackEventId              | string | Lender               | 幂等且可审计                                  |
| repaymentIntentRef           | string | Lender               | 到期与提前还款均需新建                        |
| repaymentChannelProvider     | string | Lender/支付方        | 银行或支付机构通道标识                        |
| repaymentAuthorizationUrlRef | string | Lender               | 短时已签名授权跳转引用                        |
| walletOperationJumpRef       | string | Broker               | KhmerX 创建的一次性钱包操作跳转引用           |
| walletOperationUrlRef        | string | Broker -> Lender URL | 仅用于跳转 SMILE 受控钱包页；不得记录完整 URL |

## 必须校验

1. 用户只能绑定并提现至本人银行卡；新账户需验证后可用。
2. 任何状态更新都必须带 `eventId`、`sourceDomain`、`occurredAt`、`workflowVersion`。
3. 钱包/还款前端请求不允许携带“成功”“已到账”“已结清”等可篡改结论字段。
4. Broker/KhmerX 不保存支付密码哈希、完整银行卡号、银行登录密码、OTP 或银行授权页面返回的敏感字段。
5. V1 已废止 `EMPLOYER_PAYROLL_DEDUCTION`、`USER_DIRECT_DEBIT`、`USER_MANUAL_PAYMENT` 作为产品主字段或前端枚举；还款统一通过 `repaymentIntentRef + repaymentChannelProvider + repaymentAuthorizationUrlRef` 表达用户主动授权链路。
6. Mini App 发起提现或还款时，必须先向 Broker 申请 `walletOperationJumpRef`，再跳转到 SMILE 受控钱包页；不得直接调用持牌机构资金接口。
7. Broker 创建跳转时只允许接收 `requestId`、`externalApplicationRef`、`operationType`、`idempotencyKey` 等最小字段；不得接收提现金额、银行卡、支付密码、还款金额或通道选择。
8. `walletOperationUrlRef` 必须绑定 Telegram 受控用户、申请/钱包引用和操作类型，且只允许指向 SMILE 预登记 HTTPS 域名；使用后立即失效。
