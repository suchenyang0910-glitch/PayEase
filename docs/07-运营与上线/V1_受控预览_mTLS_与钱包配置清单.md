# V1 受控预览：Broker mTLS 与持牌钱包配置清单

## 目的与边界

该清单为 `infra/preview/docker-compose.yml` 的 Broker API 提供启动前置。
它适用于受控预览，不授权真实用户、真实资金、真实银行卡数据或绕过持牌域。

Broker 只创建一次性钱包操作跳转；提现金额、银行卡、支付密码、还款金额与银行授权参数仅在持牌机构受控钱包域处理。

## VPS 私有环境文件

部署责任人在 `/etc/payease-preview/broker-api.env` 填写以下**变量名**。值必须来自受控密钥管理或部署环境；禁止提交、截图、复制到工单或聊天。

| 变量                                        | 要求                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `PAYEASE_BROKER_MTLS_SERVER_CERT_HOST_PATH` | VPS 上 Broker mTLS 服务端证书的绝对路径                                      |
| `PAYEASE_BROKER_MTLS_SERVER_KEY_HOST_PATH`  | VPS 上 Broker mTLS 私钥的绝对路径；文件权限仅允许部署责任人读取              |
| `PAYEASE_BROKER_MTLS_CA_CERT_HOST_PATH`     | 验证持牌机构客户端证书的 CA 证书绝对路径                                     |
| `PAYEASE_BROKER_INTERNAL_MTLS_HOST`         | Broker 容器内的最小暴露监听地址；须与网络/网关设计一致                       |
| `PAYEASE_BROKER_INTERNAL_MTLS_PORT`         | 1–65535 的内部 mTLS 监听端口                                                 |
| `PAYEASE_LENDER_WALLET_SHARED_SECRET`       | Broker 与持牌钱包服务之间的独立共享密钥；不得复用 Telegram、PII 或数据库密钥 |
| `PAYEASE_SMILE_WALLET_BASE_URL`             | 持牌机构受控钱包入口 HTTPS URL；不得含凭证或 URL fragment                    |
| `PAYEASE_SMILE_WALLET_ALLOWED_HOSTS`        | 上述入口的精确主机名 allowlist；不得使用通配符                               |
| `PAYEASE_WALLET_JUMP_TTL_SECONDS`           | 可选，60–3600 秒；未设置时为 900 秒                                          |

Compose 将证书在容器内固定挂载为 `/run/payease/broker-mtls/{server.crt,server.key,ca.crt}`，均为只读。容器镜像和仓库中不得存放证书或私钥。

## 上线前验证

1. 仅输出变量是否存在与证书文件是否可读；绝不打印值、路径以外内容、证书文本或私钥。
2. 在新 release 目录执行 `docker compose config`；缺任一必填变量必须失败。
3. 构建并启动新 Broker 后，确认 `/health/ready` 返回 200，且容器为 `healthy`。
4. 从持牌域使用受信任客户端证书调用内部入口：无证书、错误 CA、错误 CN 必须拒绝；合法证书才允许。
5. 创建一次性钱包跳转后，确认链接目标主机属于 allowlist、同一跳转不可重复兑换，且 Broker 日志不记录完整 URL 或密钥。
6. 只有第 1–5 项均记录通过后，才可切换静态 release 并开始 Telegram 真人验证。

## 回滚

若新容器不能通过 readiness、mTLS 验证或钱包跳转验收：停止新容器，恢复上一受控预览 release 与原 PostgreSQL 18 卷。保留失败日志与发布 SHA；不要删除证书、密钥或旧发布目录。
