# Telegram 多 Bot 认证与应急切换

## 1. 目标与边界

PayEase 用户端的主入口是 **Telegram Mini App**。服务端只接受由已启用
Bot 签名、且在有效期内的 Mini App `initData`。用户记录以 Telegram user ID
归一化（`telegram-<id>`），而不是以 Bot ID 归一化；因此同一用户从备用 Bot
进入后可继续查看自己的申请、合同确认和还款信息。

本说明不授权接入真实 Telegram、OIDC、银行或持牌机构接口。所有 Bot Token
仅可存放在部署环境的秘密管理系统或 VPS 受限环境变量中，禁止写入仓库、日志、
截图或工单。

## 2. 多 Bot 配置

在 API 服务的受控部署环境配置 `TELEGRAM_BOTS_JSON`。生产启动要求至少配置两个不同
Bot，且**至少两个 Bot 必须同时处于 `enabled: true`**；**每个已启用 Bot 必须有合法的公开 `entryUrl`**，否则
预检和 API 启动都会失败。事故期间必须先补齐替换 Bot，才可停用其中一个；每个 Bot 都应
设置同一个 PayEase Mini App URL。

```json
[
  {
    "botId": "BOT_A_ID",
    "botToken": "SET_IN_SECRET_MANAGER",
    "enabled": true,
    "entryUrl": "https://t.me/PAYEASE_PRIMARY_BOT?startapp=apply"
  },
  {
    "botId": "BOT_B_ID",
    "botToken": "SET_IN_SECRET_MANAGER",
    "enabled": true,
    "entryUrl": "https://t.me/PAYEASE_RECOVERY_BOT?startapp=apply"
  }
]
```

对已启用 Bot，`entryUrl` 是必填项；它必须是该 Bot 的公开 HTTPS `t.me` 深链接，格式不合法
会阻止 API 启动。用户会话失效时，Mini App 只请求并展示 **已启用** Bot 的这些公开入口，以便
用户立即切换；此接口绝不返回 Bot ID、Token 或任何申请资料。

还必须设置：

```text
REQUIRE_TELEGRAM_AUTH=true
PAYEASE_DEPLOYMENT_MODE=production
PAYEASE_APPLICANT_ALLOWED_ORIGINS=https://payease-user.khmerx.org
```

`PAYEASE_APPLICANT_ALLOWED_ORIGINS` 是逗号分隔的精确 HTTPS Origin 白名单。它必须填写 Mini App 实际部署域名（例如上例），不能填写 `t.me` 带路径 URL、通配符域名或 HTTP 地址。启用 Telegram 认证时，缺失该值会使 API 拒绝启动；所有 Cookie 写操作均会拒绝非白名单 Origin。

生产环境不允许以 `controlled-preview` 方式绕过认证。受控预览也默认要求 Telegram
认证；只有同时设置 `PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW=true` 且
`REQUIRE_TELEGRAM_AUTH=false` 时，才允许无认证 UX 演示。该开关只适用于受访问
控制的短期演示，绝不能用于公开域名。Bot ID 必须唯一；配置格式错误或没有任何已启用
Bot 时，登录接口返回服务不可用，而不能回退到客户端提供的用户 ID。

## 3. Bot 故障或疑似泄露时的操作

1. 在 Telegram BotFather 中停止受影响 Bot 的入口或轮换 Token；不要在聊天工具中传播新 Token。
2. **先创建并验证替换 Bot**：为其配置同一 PayEase Mini App URL、公开 `entryUrl`，并以测试
   Telegram 账号完成登录验证。将它作为 `enabled: true` 加入 `TELEGRAM_BOTS_JSON`。
3. 再将受影响 Bot 在 `TELEGRAM_BOTS_JSON` 中改为 `enabled: false`；发布后的配置必须始终保留
   **至少两个健康且启用的 Bot**。禁止以只剩一个启用 Bot 的配置重启生产 API。
4. 通过受控发布更新 API 配置。API 会在每个用户请求重新检查 Bot allowlist：被停用 Bot
   签发的既有会话立即不可用；用户必须从健康 Bot 获取新的 `initData` 并重新登录。
   如果健康 Bot 配置了 `entryUrl`，失效页面会显示该入口；停用 Bot 的入口不会显示。
5. 以一个测试 Telegram 账号验证：
   - 受影响 Bot 的旧会话访问用户 API 返回 `401`；
   - 备用 Bot 可登录；
   - 同一 Telegram user ID 仍能看到原有申请和账单；
   - 旧 `initData` 重放返回 `409`。
6. 记录安全事件、影响范围、处置时间、Bot ID（不记录 Token）和验证结果；按安全基线启动密钥泄露处置。

不要删除用户记录来处理 Bot 事故。Bot 是认证入口，不是用户资料的主键。

## 4. Login Widget / OIDC 的关系

Telegram 的 **Login Widget / Login Library（OIDC）** 是供普通浏览器网页登录使用的
独立能力，不等同于 Mini App `initData` 验签。它可以作为未来从 Facebook 或网页入口
进入 PayEase 的备用登录通道，但当前代码尚未启用 OIDC 回调，不能仅凭在 BotFather 添加
Redirect URI 就视为已接入。

启用前必须单独完成并验收：

- 每个登录客户端的精确 `Redirect URI` 与 `Trusted Origin` 白名单；
- OIDC `state`、PKCE、nonce、回调一次性使用和会话绑定；
- Client Secret 的受管存储与轮换；
- 同一 Telegram user ID 的账户关联、冲突处理和审计；
- CSP、Cookie、CSRF 以及端到端失败/撤销测试。

在这些验收完成前，Mini App 是唯一受支持的生产认证路径。

## 5. 发布前认证与个人资料加密预检

每次替换 API 容器前，必须先构建候选镜像并运行预检。预检只输出 Bot ID、启用数量和
PII 活跃密钥版本与 `ready` 状态，**不会**输出 Token 或加密密钥；非零退出码表示不得替换
当前运行中的 API 容器。

当 Telegram 认证开启时，预检同时要求：

- 至少两个不同且同时启用的 Bot，且每个已启用 Bot 都有合法的公开 `entryUrl`；
- `PAYEASE_PII_ENCRYPTION_KEY`，或当前
  `PAYEASE_PII_ENCRYPTION_KEY_VERSION` 在 `PAYEASE_PII_ENCRYPTION_KEYS_JSON`
  中对应的有效 Base64 32-byte AES-256-GCM 密钥。

唯一例外是显式的、无认证的受控预览环境（同时设置
`REQUIRE_TELEGRAM_AUTH=false` 和 `PAYEASE_ALLOW_UNAUTHENTICATED_PREVIEW=true`）；它不得收集
或保留申请人真实个人资料。

```bash
cd /opt/payease-preview/releases/<commit>/infra/preview
docker compose -p payease-preview --env-file /etc/payease-preview/broker-api.env build broker-api
docker compose -p payease-preview --env-file /etc/payease-preview/broker-api.env \
  run --rm --no-deps broker-api node broker-api/dist/deployment-preflight.js

# 仅在输出 ready:true 后执行：
docker compose -p payease-preview --env-file /etc/payease-preview/broker-api.env \
  up -d --no-deps broker-api
```
