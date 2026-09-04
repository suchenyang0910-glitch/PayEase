# ABA PayWay Sandbox 开通与联调清单

## 当前状态

**未开通：禁止启用真实钱包、提现、扣款、出款或生产回调。** 当前代码只保留默认关闭的配置校验和 ABA PayWay 回调验签组件；它不是资金接入完成的证明。

## 持牌机构需完成的开通项

1. 以实际放款与钱包权威主体 **SMILE CAPITAL PLC** 申请 ABA PayWay Merchant 的 Sandbox；不得以 KhmerX/Broker 名义持有持牌资金渠道凭据。
2. 向 ABA 确认 Sandbox 是否同时开通：收款 Checkout、交易查询、Funds Route/Payout、受益人白名单及回调域名/IP 白名单。
3. 登记仅属于持牌域的 HTTPS 回调域名；KhmerX Mini App 与 Broker 均不得直接接收 ABA 回调。
4. 使用 Sandbox 逐笔验证：创建支付、跳转支付页、成功/失败回调、重复回调、篡改签名、回调引用冲突、提现到白名单测试受益人。
5. 通过后才申请生产凭据。生产切换须由持牌机构资金负责人和安全负责人双人批准，并保留审计记录。

## 配置规则

仅部署秘密存储可写入以下变量；禁止提交到仓库、前端构建变量、截图或日志：

```text
PAYEASE_ABA_PAYWAY_ENVIRONMENT=sandbox
PAYEASE_ABA_PAYWAY_MERCHANT_ID=<merchant-id>
PAYEASE_ABA_PAYWAY_CALLBACK_SECRET=<callback-secret>
```

- 三项都缺失：ABA 模块保持关闭。
- 只配置部分变量：持牌钱包服务必须拒绝启动/启用，避免降级运行。
- Sandbox 固定使用 `https://checkout-sandbox.payway.com.kh`；Production 固定使用 `https://checkout.payway.com.kh`。不得通过环境变量接受任意 URL。
- 回调按 ABA 文档使用 `X_PAYWAY_HMAC_SHA512`、字段升序拼接、HMAC-SHA512 和常量时间比较。任何未知对象字段、验签失败或重复引用冲突均不得改变资金订单投影。

## 未完成前的禁止项

- 不得将 `PAYEASE_LENDER_WALLET_INTEGRATION_ENABLED` 设为 `true`。
- 不得调用 ABA 的 Payout/Funds Route、写入真实受益人、或发起真实扣款。
- 不得把支付密码、银行卡号/令牌、OTP、ABA 凭据传给 KhmerX Broker 或 Mini App。
- 不得把本清单、单元测试或模拟回调当作 Sandbox/生产验收结果。

## Sandbox 验收证据

完成后归档：ABA 开通确认、允许的回调域名与 IP、脱敏交易引用、回调验签日志摘要、重复回调与篡改回调的拒绝结果、PostgreSQL 集成测试结果、双人审批记录。不得归档真实密钥、完整银行卡号、OTP 或身份证信息。
