# PostgreSQL 18 受控预览升级运行手册

## 适用范围与边界

本手册仅适用于 KhmerX / PayEase 的 VPS **受控预览**环境。现有 PostgreSQL 16 数据卷不得直接挂载给 PostgreSQL 18 容器；必须经逻辑备份和恢复迁移。

- 执行前置：发布候选版本的 GitHub Actions 质量门禁与安全门禁均为绿色。
- 执行人：部署责任人；全程记录操作者、时间、发布提交和备份 SHA-256。
- 禁止：在未验证备份可读取前停止旧 PostgreSQL 16；将真实生产数据库 URL 用于集成测试；输出环境变量、Bot Token、数据库密码或 PII。
- 可回滚：旧 `payease-preview-postgres` 数据卷保留到受控预览验收窗口结束后，才可按数据保留政策处理。

## 发布前核对

1. 确认发布提交已将 `infra/preview/docker-compose.yml` 固定为 `postgres:18-alpine`，并使用新卷 `payease-preview-postgres18`。
2. 在 VPS 确认现有服务健康：Caddy、受控预览 API、PostgreSQL 16 均为可用状态。
3. 确认磁盘至少可容纳一份逻辑备份和一份 PostgreSQL 18 恢复后的数据目录；不满足则停止。
4. 确认部署目录中的 VPS 本地 `.env` 文件完整，尤其是数据库密码、PII 加密密钥、身份证查找 HMAC 密钥与多 Bot 配置；不把这些值复制进终端记录、仓库或截图。

## 备份与可读性验证

1. 以 UTC 时间和发布提交创建备份目录，仅允许 root 和部署组读取。
2. 对旧 PostgreSQL 16 容器执行 `pg_dump -Fc`，生成自定义格式逻辑备份。
3. 对备份计算 SHA-256，并使用 `pg_restore --list` 验证其可读取。
4. 在发布记录中写入：旧容器镜像、旧卷名、数据库大小、备份文件名、哈希和验证结果。
5. 任一步失败：不停止旧数据库，不进行 PostgreSQL 18 恢复。

## PostgreSQL 18 恢复与切换

1. 创建 PostgreSQL 18 专用数据卷；不要删除或重命名旧 PostgreSQL 16 卷。
2. 用 `postgres:18-alpine` 临时容器初始化新卷，并在隔离 Docker 网络中启动。
3. 使用已验证的逻辑备份恢复到 `payease_preview`；恢复账号、数据库名和扩展与现有预览配置保持一致。
4. 在新 PostgreSQL 18 容器上验证：

   - `select version()` 返回 PostgreSQL 18；
   - 关键 schema 与迁移表存在；
   - 仅检查表结构、迁移版本和行数，不导出 PII；
   - 新容器健康检查通过。

5. 停止受控预览 API，停止并保留旧 PostgreSQL 16 容器。
6. 从已通过远程 CI 的提交构建受控预览 API，使用 PostgreSQL 18 新卷执行 `docker compose up -d`。
7. API 的 `/health/ready` 必须返回 200，且容器健康状态为 `healthy` 后，才允许切换静态发布软链。

## 静态端与反向代理验收

1. 将用户端、助贷后台、持牌机构后台、HR/财务端分别解包到提交短 SHA 对应的 releases 目录。
2. 逐端用原子软链替换 `current`，保留上一个 release 目录作为静态回滚点。
3. Caddy 配置变更前执行格式校验；仅在校验通过后 reload，不启动 Nginx（Caddy 是 80/443 的唯一监听者）。
4. 验收 HTTPS、CSP、`X-Content-Type-Options`、`Referrer-Policy`、管理端 `frame-ancestors 'none'` 与用户端 Telegram 嵌入策略。
5. API 管理路径必须保持受保护；不得为了排障临时公开。

## 发布后验收与回滚

1. 在合成测试账号下执行 [V1 验收发布门禁](V1_ACCEPTANCE_RELEASE_GATE.md) 的部署后烟雾测试并记录结果。
2. 逐个已启用 Telegram Bot 验证 Webhook 密钥、私聊联系人确认和会话恢复；未全部通过不得开启强制手机号验证。
3. 若 API、迁移、数据一致性或安全头任一失败：

   - 先将静态 `current` 软链回退到上一发布；
   - 停止 PostgreSQL 18/API 容器；
   - 使用原 PostgreSQL 16 卷和原受控预览发布目录恢复服务；
   - 保留失败现场、容器日志和备份哈希，创建安全/发布事件记录。

4. 只有全部验收通过并完成观察窗口后，才可讨论旧 PostgreSQL 16 卷的保留或清理；清理需要单独授权。
