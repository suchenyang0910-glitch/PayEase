# P2-D：Telegram Mini App 安全设计复核清单（S0 预研 · 不接 Telegram 真接口）

> **S0 边界**：本文件 100% 是安全设计与验收 checklist，**绝不包含真实 Bot Token / 真实 Webhook URL / 真实 initData / 真实 User ID / 真实 Channel Invite Link**；**绝不触发任何 Bot API 调用**；**绝不接入任何 Bot Father 配置**。
>
> **启用条件（严格串行，不越线）**：S0.2 签字包 PDF 归档完成（3 PART 5 签字）→ 部署域完成（独立 `*.tg.payease-internal.com`，与 HR/财务/OPS 域物理隔离）→ 本 checklist 全部 42 项（§2+§3+§4+§5）打勾后，才允许在 **Staging 沙箱** 接入 Telegram Bot Test API。
>
> **与项目红线对齐**：管理后台类门户（Admin / Broker / Lender）**永远不**在 Telegram Mini App 内打开；仅面向 **Borrower（助贷申请人）** 的小程序级功能（查看申请进度 / 上传证件 / 接收放款通知 / 确认还款计划）可以进入此容器，且严格 CSP 隔离。

---

## 0. 安全域隔离（S0.2 签字前先在设计层面锁死，避免未来污染）

| 维度                            | 设计约束（未满足不允许上线）                                                                                                                                                                                                                                                                                    |
| :------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 部署域独立                      | Mini App 前端部署在独立子域 `borrower-tg.payease-internal.com`；与管理域 `ops-*` / `broker-*` / `lender-*` / `employer-*` **无共享 Cookie、无共享 LocalStorage、无共享 Session Store、无跨域 CORS allow-origin：** CSP `frame-ancestors` 只允许 `https://t.me/*` 和 `https://web.telegram.org/*`，其他一律 DENY |
| 身份域独立                      | Mini App 用户身份绝不复用企业 IdP（OPS/HR/FIN/OIDC）；仅用 Telegram initData → 后端签发 `short-lived PayEase session`（见 §3 TTL），session 绑定 `actor.role = borrower`，RBAC 矩阵中对 borrower 单独列 1 域                                                                                                    |
| 数据域独立                      | Mini App **绝不**请求 T0/T1/T2 红牌字段（nationalIdFull / bankAccountFull / monthlySalaryFull / 其他 employer 侧任何数据），仅允许 T3 级（loan progress enum、disbursement status enum、repayment schedule 金额字符串），且所有金额走 CI-10 amountMinor 字符串                                                  |
| 网络出口独立（S0.2 签字后落实） | Mini App 后端服务 ECS 部署在单独 VPC（broker-borrower 子域），NACL deny 到 OPS 管理 RDS / KMS CMK 管理 key / Broker 内部 API 的所有访问；仅允许访问 borrower 业务专用 RDS 读副本 + borrower KMS 别名                                                                                                            |

---

## 1. initData 验签（Telegram 侧身份的唯一信任锚，若验签失败 → 立即 401 + 审计）

> **核心原则**：**所有受保护 API 必须在服务端重放验签**；绝不信任前端 JS 校验的结果（前端校验仅用于 early UX fail-fast）。

### 1.1 验签流程 Checklist（10 项，S1 Staging 启用时逐项打勾）

|   #    | 检查项（Y/N）                                                                                                                                                                                                      | 测试矩阵                                                                                          |
| :----: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| 1.1.1  | □ Bot Token **绝不**出现在前端 bundle / 源码 / 构建产物 / Mini App 前端 localStorage / sessionStorage；仅存在后端 Secret Manager（S0.2 KMS envelope 加密后存储）                                                   | 用 Network-Zero 测试 + Gitleaks 双扫描                                                            |
| 1.1.2  | □ 后端实现严格按 Telegram 官方算法：`HMAC-SHA256(bot_token, sorted_qs_no_data_checksum_with_newline)` → 与 `hash=` 对比                                                                                            | 提供 5 条 fixture（§1.3）覆盖全部合法/非法情况                                                    |
| 1.1.3  | □ 字段排序严格按字母序；对 `=` 未编码、空值 `""`、`user=` JSON 嵌套中嵌套字段变化等均做相同 hash 计算                                                                                                              | S1 契约测试：改变 user JSON 中任一字段，hash 必须变；改变字段顺序，hash 不变                      |
| 1.1.4  | □ `auth_date` 必须可解析为 Unix 秒；**TTL 窗口 = 5 分钟**（硬编码，不可配置）；超时 initData → 401 `TELEGRAM_INITDATA__STALE_AUTH_DATE`                                                                            | 4 组 fixture：0s/299s/300s/301s → PASS/PASS/FAIL/FAIL                                             |
| 1.1.5  | □ 所有受信任字段必须**显式白名单**：`user / chat / receiver / start_param / can_send_after / chat_instance / chat_type`；未识别字段出现 → 400 `TELEGRAM_INITDATA__UNKNOWN_FIELD`                                   | 注入 `evil_field=1` 必须 fail                                                                     |
| 1.1.6  | □ `user.id` 与 PayEase borrower profile 绑定后，**必须记录 user.first_name/last_name/username/language_code 的 initData 原始 SHA-256**（用于跨会话检测改名/伪装）                                                  | 每用户首登 + 每次登录取 hash 对比；变更→告警 + 强制重登                                           |
| 1.1.7  | □ 防止 initData **在多个 PayEase 会话复用**：每次 200 登录成功后，把 `hash` 写入 Redis（或等价 cache），key=`tghash:<sha256(initData_hash)>` TTL=5min；命中则 409 `TELEGRAM_INITDATA__HASH_REPLAY`（见 §2 防重放） | S1 测试：同一 initData 第 1 次=200，第 2 次 5 分钟内=409                                          |
| 1.1.8  | □ 时间安全对比：所有 HMAC hash 比较必须 `crypto.timingSafeEqual`；**绝不**使用 JS `==` / `===` 字符串直接比较                                                                                                      | 代码审计 + Semgrep 规则：`==.*hash` 一律 WARNING ERROR                                            |
| 1.1.9  | □ 错误信息不泄露算法细节：对外所有 initData 失败统一返回 `{ "code": "TELEGRAM_INITDATA__INVALID" }`（无区分 bad_signature / stale / replay），对内审计单独记录细粒度                                               | 错误响应头 `Content-Type: application/json; charset=utf-8`，body 长度统一（padding）防长度 oracle |
| 1.1.10 | □ 双时间戳校验：除 Telegram `auth_date`，后端再记录 `received_at_ms`；若 `received_at_ms - auth_date*1000 > 300000` 或 `<0`（时钟漂移） → 拒绝；时钟漂移 >5s 单独立 metric 告警                                    | CI 注入时钟偏移 fixture                                                                           |

### 1.2 严禁进入生产的 6 类"伪验签"实现

> 代码审计必须明确以下实现是 **BLOCK 级红线**，即使能跑通也**绝不允许合并**：
>
> 1. 前端用 JS 校验 `window.Telegram.WebApp.initData` 通过后直接信任，不再把 initData 回传后端做二次验签
> 2. 后端自己实现了"简化版"验签：例如拼接字段没加 `\n`、没按字母序排、漏了 user JSON 字符串化
> 3. 验签失败只打 warning 不 return 401（用户继续往下走）
> 4. 为了测试方便，把 `process.env.NODE_ENV === 'development'` 时设置 `SKIP_INITDATA_VERIFY=true` → **即使在 Staging 也不允许跳过**
> 5. 把 `auth_date` 窗口配置成 `86400`（24h）；窗口过大是 replay 漏洞
> 6. 把 initData 原样写进 JWT payload 并信任 JWT，而 initData 本身仍有 5min TTL，但 JWT TTL = 30d → initData TTL 绕过

### 1.3 S1 契约测试 Fixture 种子（initData，S0 仅文档结构；真实 fixture 值 S1 生成）

> **注意**：这里只定义 fixture 结构；真实的 `hash=` / `auth_date` / `user=` 值 S1 用测试 Bot Token 生成，**绝不提交到 Git**（Git 提交的 fixture 值必须是占位 `PLACEHOLDER_*`）。

```json
// fixtures/telegram-miniapp/initdata-fixtures/1-valid.authdate-10s.json
{
  "_fixture_note": "PLACEHOLDER: valid initData. hash computed with TEST-ONLY BOT TOKEN on S1. Never commit real hash.",
  "inputInitDataQS": "auth_date=PLACEHOLDER_T_10S&query_id=PLACEHOLDER_QQID&user=%7B%22id%22%3A100000001%2C%22first_name%22%3A%22Mock%22%2C%22last_name%22%3A%22User%22%7D&hash=PLACEHOLDER_HASH_VALID",
  "expected": { "verify": true, "httpStatus": 200, "sessionIssued": true }
}
// 2-tampered.user.json → user.id 改了但 hash 没重算 → 401
// 3-stale.authdate-301s.json → 401 TELEGRAM_INITDATA__STALE_AUTH_DATE
// 4-replay.same.hash.json → 2nd call → 409 TELEGRAM_INITDATA__HASH_REPLAY
// 5-algo-wrong.case-sort.json → auth_date & user 顺序错 → 应该按字母序算，否则 verify=false
// 6-unknown-field.json → 注入 evil_field → 400 TELEGRAM_INITDATA__UNKNOWN_FIELD
```

---

## 2. 防重放与会话生命周期（S0.5 桌面演练剧本 1/4 对应的工程化落地 Checklist，12 项）

|  #   | 检查项（Y/N）                                                                                                                                                                                                                                                                                                                                  | 对应桌面演练剧本场景                                                                 |
| :--: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| 2.1  | □ 会话 TTL 硬约束：PayEase 侧颁发的 borrower session（cookie / HTTP header）TTL **最多 15 分钟**，绝不能与 Telegram 客户端的"永远在线"保持一致；超过 TTL 必须重新走 initData 验签（即使 Mini App 还开着）                                                                                                                                      | 剧本 1：密钥泄露时，旧会话也因为短 TTL 自动失效，减少横向移动窗口                    |
| 2.2  | □ 会话绑定：session cookie `Path=/; HttpOnly; Secure; SameSite=None`（因为在 iframe 里必须 SameSite=None；但对应 §4 CSP 只允许 tg 域，降低 CSRF 面）；**已实现绑定 user.id + authenticated Bot + UA SHA-256**，UA 变更 → 401 强制重登。`client IP` 绑定必须等 S0.2 明确 Caddy/负载均衡可信代理边界后才可实现；禁止直接信任 `X-Forwarded-For`。 | 剧本 4：证件越权访问，若会话 token 被盗用跨 UA → 失败；IP 绑定上线前仍需基础设施验收 |
| 2.3  | □ 防重放（1.1.7 补全）：每次成功登录消耗 initData 哈希，全局唯一；TTL=5min 过期；过期后即使是同一 initData，必须重新由 Telegram 客户端生成新一份（auth_date 变了 → hash 也变）                                                                                                                                                                 | 剧本 2：重复放款回调，如果是同一 borrower 多次点击"确认放款"防重                     |
| 2.4  | □ idempotency_key：所有状态变更 API（确认申请、上传证件、确认还款计划、申诉异议）必须前端传 UUID v4 `x-tg-idem`，TTL=1h；后端同 key → 直接返回缓存响应（200/201）但不落库；缓存响应与首次响应必须 byte-for-byte 一致（防双写）                                                                                                                 | 剧本 2：错误放款双回调，幂等去重                                                     |
| 2.5  | □ Rate Limit：按 user.id 维度，5 分钟内最多 30 次登录 / 20 次上传 / 10 次状态变更；超过 → 429；单 IP 维度作为第二道                                                                                                                                                                                                                            | 剧本 1：攻击者拿泄露 initData 暴力                                                   |
| 2.6  | □ 强制登出机制：后端有 API `POST /tg/session/destroy-all` 按 user.id 销毁该用户所有活跃会话；CISO 可在剧本 1 密钥泄露演练一键触发                                                                                                                                                                                                              | 剧本 1：T+00:05 强制会话下线                                                         |
| 2.7  | □ 会话 idle timeout：即使 session cookie 还有 TTL，5 分钟内无任何请求也强制失效（前端心跳 4 分钟一次保持活跃）                                                                                                                                                                                                                                 | 防止离开手机未锁屏导致会话劫持                                                       |
| 2.8  | □ 敏感操作二次确认（"确认放款 / 确认自动扣款授权"）：必须二次调用 initData 刷新 + 弹出 pin / biometric（通过 `Telegram.WebApp.showPopup` biometric 提示，后端记录 biometric_passed=true 的 audit event）                                                                                                                                       | 剧本 2：防止误点击放款按钮双触发                                                     |
| 2.9  | □ Origin 校验：后端中间件强制 `Origin` header 只能是 `https://t.me` / `https://web.telegram.org` / Mini App 域名（非 tg origin 直接 403）                                                                                                                                                                                                      | 第三方站点伪造 iframe                                                                |
| 2.10 | □ Referer-Policy：响应头 `Referrer-Policy: no-referrer`，不把 borrower initData 所在查询参数泄露给外链点击                                                                                                                                                                                                                                     | 剧本 4：证件点击外链泄露 referer                                                     |
| 2.11 | □ 全局 nonce：每次页面渲染 `<script>` 注入 CSP nonce（见 §4），nonce 长度 32 byte 加密安全随机；nonce 绑定 session；1 请求 1 nonce，不重用                                                                                                                                                                                                     | 防止 inline XSS 注入                                                                 |
| 2.12 | □ Backend audit 日志去重：对 2.4 幂等返回的缓存响应，审计事件要标 `eventCode = <original>_IDEMPOTENT_REPLAY`，但 outcome 仍然 SUCCESS，不重复入账                                                                                                                                                                                              | 防止审计日志统计数虚高                                                               |

---

## 3. Mini App 容器内浏览器安全头 + CSP 落地清单（WEB-08 严格化 + iframe 特有约束，10 项）

> 由于 Mini App 运行在 Telegram 客户端内嵌 webview（iOS WKWebView / Android WebView / Desktop Telegram Web），浏览器安全头**与管理后台 OPS/Broker/Lender 的策略必须不一样**。

|  #   | 响应头 / CSP                                                                       | 要求（与管理后台的差异）                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 对齐 WEB-08 / 项目红线                                              |
| :--: | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| 3.1  | `X-Frame-Options`                                                                  | **允许**被 `t.me` 作为 iframe 打开。**注意：X-Frame-Options 只能 ALLOW-FROM 在现代浏览器无效，所以必须用 CSP frame-ancestors 代替；并且 X-Frame-Options 不设置（或仅作为 legacy 注释说明，不在实际响应头里下发）**                                                                                                                                                                                                                                                                      | 与管理后台 `DENY` 相反，容器差异化策略落地                          |
| 3.2  | `Content-Security-Policy`（核心，下一行展开，必须 7 个子项全落实）                 | **① `default-src 'self'`；② `script-src 'self' 'nonce-<random-32byte>'` → 禁止任何 `'unsafe-inline'` / `'unsafe-eval'`；③ `style-src 'self'` 或 CSP nonce；④ `img-src 'self' data: https://cdn.jsdelivr.net`（白名单）；⑤ `connect-src 'self' https://borrower-tg-api.payease-internal.com` → 绝不能写 `connect-src *`；⑥ `frame-ancestors https://t.me https://web.telegram.org 'none'` → 其他域名 iframe 被 block；⑦ `frame-src 'none'` → 禁止 Mini App 内部再嵌套任何第三方 iframe** | 管理后台 frame-ancestors 是 'none'；这里严格只 allow tg 域          |
| 3.3  | `Strict-Transport-Security`                                                        | `max-age=31536000; includeSubDomains; preload` 强制 HTTPS；即使内网也要开启；绝不 downgrade 到 HTTP                                                                                                                                                                                                                                                                                                                                                                                     | 与其他域一致                                                        |
| 3.4  | `X-Content-Type-Options`                                                           | `nosniff`；API 响应必须声明正确 `Content-Type: application/json`；静态资源声明正确 type                                                                                                                                                                                                                                                                                                                                                                                                 | WEB-08 项                                                           |
| 3.5  | `Permissions-Policy`                                                               | **全禁用 + 严格白名单**：`camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()`；其中 camera **如需证件拍照**单独加 `camera=(self "https://t.me")` 并 DPO 签字；默认全关                                                                                                                                                                                                                          | WEB-08 与管理后台策略相同，但 camera 可能需要单独白名单→法务DPO批准 |
| 3.6  | `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`                      | 可选 COOP `same-origin` + COEP `require-corp`；防止 Mini App 内第三方（若未来加广告/社交外链）跨源打开 PayEase 窗口                                                                                                                                                                                                                                                                                                                                                                     | 浏览器隔离增强                                                      |
| 3.7  | 存储限制（WEB-08 核心红线）：**`localStorage.setItem` / `sessionStorage.setItem`** | 全局 patch（如 hr/finance 门户的 test-setup.ts）：任何写入 key 正则 WEB_08_RE（`token                                                                                                                                                                                                                                                                                                                                                                                                   | credential                                                          | password | secret | key | jwt | initData | id_token | access_token | refresh_token | nonce`）直接 throw；即使开发也不允许；所有 session 存在 **HttpOnly Secure Cookie**，JS 不可读 | 与管理后台 WEB-08 完全一致 |
| 3.8  | Cookie 约束                                                                        | `SameSite=None; Secure; HttpOnly; Path=/; Max-Age=900; Partitioned`（因为跨站 iframe + Chrome 第三方 cookie phaseout，必须加 Partitioned）；`__Host-` 前缀（要求 HTTPS + Secure）                                                                                                                                                                                                                                                                                                       | iframe 场景的 cookie 现代浏览器规范                                 |
| 3.9  | `Set-Cookie` 不能在非 HTTPS 下发                                                   | 开发阶段必须使用 `https://*.localhost` 自签证书或 mkcert，**禁止 HTTP 开发**（否则 SameSite=None + Partitioned 都不生效）                                                                                                                                                                                                                                                                                                                                                               | 防降级攻击                                                          |
| 3.10 | Service Worker                                                                     | **默认禁止注册 SW**；若未来需要离线缓存，必须经过 CISO + DPO 单独审批，且 SW 范围 `/sw-cache-only/`，不碰 API / cookie / initData 路径                                                                                                                                                                                                                                                                                                                                                  | 防止 SW 被投毒后长期劫持                                            |

### 3.11 CSP 违规报告接入（S1）

`Content-Security-Policy-Report-Only: ...; report-uri /_meta/csp-report;` → `/csp-report` 收集到审计流，自动触发告警阈值：

- 任何 `blocked-uri = https://evil.test` → P1 高敏告警
- 每周 CSP 报告 Top 10 清理后才能发布新版

---

## 4. 前端运行时零信任与前端代码级硬约束（10 项）

|  #   | 检查项（Y/N）                                                                                                                                                                                                                        | 红线说明                    |
| :--: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| 4.1  | □ 前端任何地方**绝不** `JSON.parse(window.Telegram.WebApp.initData)` 后把 user.id 当已认证主体用；所有主体信息**只来自后端 session**（后端 initData 验签后的返回）                                                                   | 防止前端改 user.id 伪装他人 |
| 4.2  | □ 前端金额字段一律渲染 `formatHuman({ amountMinor: string, currency })`（来自 `@payease/shared-money`）；**绝不** `parseFloat() * 100` 做 number 计算                                                                                | CI-10 金额守卫对齐          |
| 4.3  | □ 任何 `<a href="https://..." target="_blank">` 外链必须加 `rel="noopener noreferrer nofollow"`；外链点击前必须弹二次确认（"你即将离开 PayEase Mini App，跳转非官方站点"），且**浏览器 `window.open` 不能带任何 PayEase query 参数** | 防 referer 泄露 + 钓鱼跳转  |
| 4.4  | □ 所有表单输入自动防 XSS：DOMPurify 或 React 本身 React.createElement 转义；绝不使用 `dangerouslySetInnerHTML`（Semgrep 规则 `dangerouslySetInnerHTML → ERROR`）                                                                     | XSS 防护                    |
| 4.5  | □ `Telegram.WebApp.BackButton`、`MainButton`、`showConfirm` 的**所有回调**均由后端接口驱动；任何"本地 state 变了就算成功"的前端假成功一律 FAIL code review（必须等后端 2xx 再 show Success）                                         | 防前端假放款/假确认         |
| 4.6  | □ 所有错误消息文案不包含 debug 栈、SQL 错误文本、内部字段名；统一走 `ErrorCodeI18n["TG_0001"]` 这种字典                                                                                                                              | 信息泄露防护                |
| 4.7  | □ 全局 Network-Zero（与 hr/finance 门户 test-setup 一致）：构建产物级 + 测试级，**任何** `fetch() / XMLHttpRequest / WebSocket / navigator.sendBeacon` 到非白名单（self + tg cdn）→ 直接抛错并 audit                                 | 防止偷偷接第三方统计 SDK    |
| 4.8  | □ 第三方 JS SDK 白名单：S0.5 阶段 **无任何第三方 SDK**；未来接入统计/风控（如 Arkose / hCaptcha）必须先法务 + CISO + DPO 三审                                                                                                        | 防 SDK 数据外发             |
| 4.9  | □ 全局 `Date` 不做敏感判断：敏感 TTL 判断（会话 TTL / 重放 TTL / 确认 TTL）全在后端；前端 `new Date()` 只用于展示，不用于鉴权                                                                                                        | 客户端时钟改时间绕过 TTL    |
| 4.10 | □ 构建时注入 SRI（Subresource Integrity）：所有 `<script src>` 和 `<link rel=stylesheet>` 必须带 `integrity=sha384-<hash>`；CDN 资源篡改自动拒绝                                                                                     | 供应链攻击防护              |

---

## 5. 启用门禁 Checklist（进入 Staging Bot Test API 前必须打勾的 10 项）

> 未打勾 = CISO 有权阻断接入，即使功能全绿

|  #  | 门禁项                                                                                                                                                                             |        负责方         | 通过？ |
| :-: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------: | :----: |
| G1  | 本文件 §1（10 项）+ §2（12 项）+ §3（10 项）+ §4（10 项）= 共 42 项，全部代码审计 + S1 契约测试自动化覆盖                                                                          |      工程 + CISO      |   □    |
| G2  | S0.2 签字包 3 PART 全部 5 位签字完成并归档（SECURITY_S0_2_CHECKLIST.md 末页 PDF + SHA-256 留痕）                                                                                   |      法务 + 合规      |   □    |
| G3  | Mini App 部署域 `borrower-tg.*` 与管理域 / 企业域 DNS 完全独立；WAF 规则 deny 所有从 Mini App 域 IP / User-Agent 到管理域 API 的请求                                               |    基础设施 Owner     |   □    |
| G4  | initData 验签相关 S1 契约测试 6 条 fixture（§1.3）在 CI 中 100% PASS；1.2 中 6 类伪验签实现都被 Semgrep ERROR 规则命中                                                             |      CISO + 工程      |   □    |
| G5  | CSP 报告：Staging 环境运行 7 天，累计 CSP 违规 = 0 或全部是 false positive（逐一关闭）                                                                                             |         工程          |   □    |
| G6  | 桌面演练剧本 1（密钥泄露）已在 Staging Telegram 沙箱做过"Bot Token 泄露 → 强制会话下线 → 轮换 Bot Token → 新会话登录成功"全流程                                                    |      CISO + 工程      |   □    |
| G7  | 借款确认 / 还款计划确认的**双幂等**（前端 idem + 后端放款回调 idem）在剧本 2 演练中做到"重复点击 3 次 → 实际入账 1 次"                                                             | 产品 + 财务对账负责人 |   □    |
| G8  | `Permissions-Policy: camera=()` 默认禁用已落实；若未来证件拍照打开 camera，单独 DPO 签字记录 + 权限弹窗文案合规审查（说明不存储不对外发送）                                        |          DPO          |   □    |
| G9  | WEB-08 存储限制通过全局 patch：在手机真机 3 台（iOS Safari 内嵌 / Android Telegram WebView / Desktop Telegram）测试，localStorage 尝试写入 `token=...` → 必须 throw 并出现审计告警 |      质量 + 工程      |   □    |
| G10 | 对外披露：用户首次打开 Mini App 有明显"PayEase 隐私政策 / Cookie 政策"链接 + 勾选同意；不同意则直接关闭 Mini App（不允许继续）                                                     |      法务 + DPO       |   □    |

---

## 6. 签字（安全设计通过，允许 S1 阶段实现；但仍不连真实 Bot Token）

| 签字方            | 确认                                                                                                            |        签字        |    日期    |
| :---------------- | :-------------------------------------------------------------------------------------------------------------- | :----------------: | :--------: |
| 安全 Owner / CISO | □ 42 项 Checklist 全部对齐安全策略；与管理后台 CSP 差异化策略不引入新风险；伪验签 6 类红线已写入 Semgrep ERROR  | __________________ | ____/**/** |
| 法务              | □ 外链点击、cookie same-site=none、跨站 iframe 合规；数据共享声明与 DPA 一致                                    | __________________ | ____/**/** |
| DPO / 合规        | □ camera 权限默认关；CSP frame-ancestors 只允许 tg；存储 WEB-08 禁止明文 initData/JWT                           | __________________ | ____/**/** |
| 基础设施 Owner    | □ 部署域独立；CSP + HSTS + Permissions-Policy 响应头在 Vite Preview/Staging 双模式（P1 安全头回归测试）验证通过 | __________________ | ____/**/** |
| 产品 Owner        | □ 桌面演练剧本 1/2/4 全跑通；Power User 反馈确认 15min TTL 与二次确认不影响转化率                               | __________________ | ____/**/** |
