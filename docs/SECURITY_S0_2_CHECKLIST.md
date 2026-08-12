# S0.2：隔离基础设施三要素签字包（启动真实 MVP 的唯一硬门槛）

> **生效范围**：本文件是写任何 Terraform、申请任何 AWS 云资源、连接任何真实 HRIS/银行/持牌机构接口、启用任何真实 IdP 之前，**必须 100% 完成签字**的前置条件清单。
>
> **三要素（缺一不可，串行签字）**：
>
> 1. `PART 1` AWS 三域账号边界 + AssumeRole 信任矩阵
> 2. `PART 2` 部署区域与数据合规（PII/金融数据驻留 + 跨境传输法务确认）
> 3. `PART 3` KMS 密钥 + 证书 CA Owner 授权矩阵（三权分立）
>
> **红线**：三部分全部签字并归档前，严禁执行以下任一行为 —
>
> - 写 Terraform skeleton（哪怕是空的 aws provider block）
> - 登录 / 在 `broker-prod`、`lender-prod`、`employer-prod` 任一账号中创建资源
> - 在 `partner-contracts` 之外创建任何包含真实 API endpoint 的代码
> - 启用真实 SAML/OIDC/SCIM 回调
> - 在 S0.5 门户之外接入真实银行 SDK、HRIS SDK、ERP SDK
>
> **签字人角色定义**：
>
> | 角色              | 英文                  | 说明                                                  |
> | :---------------- | :-------------------- | :---------------------------------------------------- |
> | 产品 Owner        | Product Owner         | 业务责任方，确认域划分与业务预期一致                  |
> | 安全 Owner / CISO | CISO / Security Owner | 安全责任方，确认隔离强度、密钥授权、边界控制          |
> | 合规 / DPO        | DPO / Compliance      | 数据合规责任方，确认柬埔寨 PII/金融数据驻留与跨境法务 |
> | 基础设施 Owner    | DevOps / Infra Owner  | 基础设施执行方，确认账号/VPC/区域部署可落地           |
> | 法务              | Legal Counsel         | 跨境传输条款、数据处理协议 DPA 签字                   |

---

## PART 1 · AWS 三域账号边界 + AssumeRole 信任矩阵

### 1.1 账号清单（三域 × 三环境 = 9 账号独立）

> **原则**：助贷域 / 机构域 / 企业域 三域物理分离；Dev / Staging / Prod 三环境分离。严禁任何两域合并到同一 AWS 账号（含合并 OU）。严禁 Staging 账号复用 Production 的 KMS 密钥或 CA。

|  #  | 账号别名（推荐）          | 邮箱                           | 业务域                                    | 环境    | OU 路径                 | AWS 账号 ID（空栏填写） | 12 位 ID 填写位                              |
| :-: | :------------------------ | :----------------------------- | :---------------------------------------- | :------ | :---------------------- | :---------------------- | :------------------------------------------- |
|  1  | `payease-root`            | `aws-root@payease.io`          | 根账号（仅 billing + SCP + OU）           | Root    | `Root`                  | __________________      | `□ 已创建 □ SCP 生效 □ MFA on root`          |
|  2  | `payease-broker-dev`      | `aws+broker-dev@payease.io`    | 助贷域 + 运营域                           | Dev     | `Root/Broker/Dev`       | __________________      | `□ 已创建`                                   |
|  3  | `payease-broker-stg`      | `aws+broker-stg@payease.io`    | 助贷域 + 运营域                           | Staging | `Root/Broker/Staging`   | __________________      | `□ 已创建`                                   |
|  4  | `payease-broker-prod`     | `aws+broker-prod@payease.io`   | 助贷域 + 运营域                           | Prod    | `Root/Broker/Prod`      | __________________      | `□ 已创建`                                   |
|  5  | `payease-lender-dev`      | `aws+lender-dev@payease.io`    | 机构（持牌）域                            | Dev     | `Root/Lender/Dev`       | __________________      | `□ 已创建`                                   |
|  6  | `payease-lender-stg`      | `aws+lender-stg@payease.io`    | 机构（持牌）域                            | Staging | `Root/Lender/Staging`   | __________________      | `□ 已创建`                                   |
|  7  | `payease-lender-prod`     | `aws+lender-prod@payease.io`   | 机构（持牌）域                            | Prod    | `Root/Lender/Prod`      | __________________      | `□ 已创建`                                   |
|  8  | `payease-employer-dev`    | `aws+employer-dev@payease.io`  | 企业（HR+财务）域                         | Dev     | `Root/Employer/Dev`     | __________________      | `□ 已创建`                                   |
|  9  | `payease-employer-stg`    | `aws+employer-stg@payease.io`  | 企业（HR+财务）域                         | Staging | `Root/Employer/Staging` | __________________      | `□ 已创建`                                   |
| 10  | `payease-employer-prod`   | `aws+employer-prod@payease.io` | 企业（HR+财务）域                         | Prod    | `Root/Employer/Prod`    | __________________      | `□ 已创建`                                   |
| 11  | `payease-shared-services` | `aws+shared@payease.io`        | 共享：统一日志 / 审计 / CI runner（仅读） | Shared  | `Root/Shared`           | __________________      | `□ 仅 VPC Endpoint Service □ 无跨域 peering` |

### 1.2 SCP（Service Control Policy）禁止项（OU 级）

|   #    | SCP 规则                                                                                           | Broker OU |  Lender OU  | Employer OU | Shared OU |         确认          |
| :----: | :------------------------------------------------------------------------------------------------- | :-------: | :---------: | :---------: | :-------: | :-------------------: |
| SCP-01 | 禁止创建 VPC peering connection（跨域物理隔离）                                                    |   Deny    |    Deny     |    Deny     |   Deny    |          `□`          |
| SCP-02 | 禁止非 `ap-southeast-1`（新加坡） / 自定义合规区外的区域创建资源（区域锁定）                       | Deny 其他 |  Deny 其他  |  Deny 其他  | Deny 其他 |          `□`          |
| SCP-03 | 禁止 Prod OU 中关闭 CloudTrail / 关闭 GuardDuty / 关闭 Config                                      |   Deny    |    Deny     |    Deny     |     —     |          `□`          |
| SCP-04 | 禁止根账号中创建任何 EC2/RDS/S3/Lambda 工作负载（根账号只做 org/billing）                          |     —     |      —      |      —      |     —     | `□ 仅 billing+SCP+OU` |
| SCP-05 | 禁止 Employer OU / Lender OU 中调用 `sts:AssumeRole` 到 Broker OU 的任何角色（跨域 deny-all 默认） |     —     | Deny→Broker | Deny→Broker |     —     |          `□`          |
| SCP-06 | 禁止任何 OU 直接调用 `kms:CreateKey`（仅通过 Terraform 自动化 + 审批工作流创建）                   |   Deny    |    Deny     |    Deny     |   Deny    |          `□`          |

### 1.3 AssumeRole 信任边界（白名单矩阵，默认 deny-all）

> 规则：调用方（行）× 被调用方（列）。仅 `✓` 格子允许 `sts:AssumeRole`，其余一律 SCP + 资源策略 deny。
> 所有跨域 AssumeRole 必须带 `ExternalId`，并且只允许调用 VPC Endpoint Service 的接口，不允许直接 assume 对方 EC2/RDS/Lambda 执行角色。

| 调用方 ↓ / 被调 →               | broker-dev | broker-stg |                 broker-prod                  | lender-dev | lender-stg |          lender-prod           | employer-dev |      employer-stg       | employer-prod |
| :------------------------------ | :--------: | :--------: | :------------------------------------------: | :--------: | :--------: | :----------------------------: | :----------: | :---------------------: | :-----------: |
| CI / Terraform runner（shared） |     ✓      |     ✓      |               ✓（需手动审批）                |     ✓      |     ✓      |          ✓（需审批）           |      ✓       |            ✓            |  ✓（需审批）  |
| broker-dev                      |     —      | ✓（仅 CI） |                      ×                       |     ×      |     ×      |               ×                |      ×       |            ×            |       ×       |
| broker-prod                     |     ×      |     ×      |                      —                       |     ×      |     ×      | ✓（机构回调签名校验 endpoint） |      ×       |            ×            |       ×       |
| lender-prod                     |     ×      |     ×      |                      ×                       |     ×      |     ×      |               —                |      ×       |            ×            |       ×       |
| employer-prod（HR）             |     ×      |     ×      | ✓（仅提交 Approve/Reject 核验结果 endpoint） |     ×      |     ×      |               ×                |      —       | ✓（仅 HR→FIN 对账接口） |       ×       |
| employer-prod（FIN）            |     ×      |     ×      |    ✓（仅提交差异工单/对账确认 endpoint）     |     ×      |     ×      |               ×                |      ×       |            —            |       —       |

**签字（PART 1 · 账号边界）**：

| 签字方            | 我确认上述 9+1 账号划分、11 条 SCP、6×6 AssumeRole 白名单矩阵正确、可落地、无越权风险 | 签字               | 日期       |
| :---------------- | :------------------------------------------------------------------------------------ | :----------------- | :--------- |
| 产品 Owner        | □ 确认域划分符合业务边界，无合并需求                                                  | __________________ | ____/**/** |
| 安全 Owner / CISO | □ 确认 SCP 覆盖全面、AssumeRole 白名单最小权限、三域物理隔离不降级                    | __________________ | ____/**/** |
| 基础设施 Owner    | □ 确认账号 / OU / SCP / AssumeRole 在 AWS Organization 中可按上表落地                 | __________________ | ____/**/** |
| 法务              | □ 确认不涉及跨境账号控制责任不明（所有账号均为 PayEase 全资实控）                     | __________________ | ____/**/** |

---

## PART 2 · 部署区域与数据合规（PII / 金融数据驻留 + 跨境传输）

### 2.1 区域决策表

| 决策项                          | 选项 A                                               | 选项 B                                        | 本次选择（打勾 □）                                               |
| :------------------------------ | :--------------------------------------------------- | :-------------------------------------------- | :--------------------------------------------------------------- |
| 主区域（Primary）               | `ap-southeast-1`（新加坡，AWS SG）                   | `ap-southeast-3`（印尼雅加达，延迟高）        | `□ A（新加坡） □ B（雅加达） □ 其他（说明：__________）`         |
| 灾备区域（DR）                  | `ap-southeast-2`（悉尼）                             | `ap-northeast-1`（东京）                      | `□ A（悉尼） □ B（东京） □ 暂不启用 DR（S0 MVP 阶段）`           |
| 数据驻留要求（柬埔寨 PII/金融） | 仅主区域 RDS/S3/KMS；灾备区仅加密冷备份              | 主区域 + 灾备区双活（含 PII）                 | `□ A（驻留主区，DR 冷备） □ B（双活，法务先签跨境传输）`         |
| KMS CMK 区域                    | 与主区域一致；DR 区域独立 CMK（不跨区复制 CMK 明文） | 跨区域 multi-region CMK（不推荐，合规责任高） | `□ A（区域独立 CMK） □ B（multi-region CMK，法务+DPO 附加签字）` |

### 2.2 柬埔寨 PII/金融数据驻留与分类（具体落地字段见 `DATA_CLASSIFICATION_DEIDENTIFICATION.md`）

| 数据分类                                               | 是否允许跨出柬埔寨主区域（加密状态）                  | DPO 确认 |
| :----------------------------------------------------- | :---------------------------------------------------- | :------: |
| 员工身份证号全文 / 护照号全文 / 手机号                 | ❌ 严禁跨境、严禁出主区域；DR 冷备份需单独签字        |   `□`    |
| 员工月薪资全文 / 银行卡号全文                          | ❌ 严禁跨境、严禁出主区域；DR 冷备份需单独签字        |   `□`    |
| 身份证后 4 位 / 薪资分桶（<300 USD / 300-600 / >600）  | ✅ 可传输到 DR 冷备份（AES-256-GCM + KMS CMK）        |   `□`    |
| 企业税号 / 企业名称 / 贷款金额（聚合级，不带个人身份） | ✅ 可传 DR；可传持牌机构域（Lender OU）               |   `□`    |
| 助贷审批意见（无身份证/薪资全文）                      | ✅ 可传 DR；可在 Broker OU 内流转                     |   `□`    |
| 银行结算流水号 / 对账批次号（不带个人身份）            | ✅ 可传 DR；可在 Broker-Lender-FIN 三域白名单接口流转 |   `□`    |

### 2.3 跨境数据传输（Cross-Border Transfer）法务确认

> **红线**：任何从柬埔寨向 PayEase 新加坡母公司、AWS 区域、持牌机构境外数据中心的个人数据传输，**必须先签 DPA + SCC（标准合同条款）+ 柬埔寨 DPO 书面许可**。在以下三栏签完前，严禁任何跨境传输动作（含 DR 冷备份的自动化复制）。

| 项目                                                                   | 法务说明（填写）   | 法务签字           | DPO 签字           | 日期       |
| :--------------------------------------------------------------------- | :----------------- | :----------------- | :----------------- | :--------- |
| 2.3.1 柬埔寨员工 PII 向 AWS 新加坡主区域传输（处理、存储、备份）       | __________________ | __________________ | __________________ | ____/**/** |
| 2.3.2 PII 向 AWS 悉尼/东京 DR 区域加密冷备份传输（仅灾备恢复，不处理） | __________________ | __________________ | __________________ | ____/**/** |
| 2.3.3 薪资/身份证等受限字段向持牌机构 Lender 的跨境传输（如有）        | __________________ | __________________ | __________________ | ____/**/** |

**签字（PART 2 · 区域与合规）**：

| 签字方         | 我确认上表区域决策、数据驻留范围、跨境传输法务均已完成且可合规落地 | 签字               | 日期       |
| :------------- | :----------------------------------------------------------------- | :----------------- | :--------- |
| 合规 / DPO     | □ 数据分类驻留符合柬埔寨 PII 保护法 / 金融监管要求                 | __________________ | ____/**/** |
| 法务           | □ 2.3 三项跨境传输的 DPA/SCC 已签发或明确豁免依据                  | __________________ | ____/**/** |
| 产品 Owner     | □ 区域决策不影响 MVP 用户体验（延迟/可用性可接受）                 | __________________ | ____/**/** |
| 基础设施 Owner | □ 区域决策在技术上可落地（KMS 多区域、RDS 备份、S3 CRR 可配置）    | __________________ | ____/**/** |

---

## PART 3 · KMS 密钥 + 证书 CA Owner 授权矩阵（三权分立）

### 3.1 密钥 / 证书分类与 Owner（三权分立：创建者 / 使用者 / 轮换者 / 吊销者不得同一人）

> **Owner 定义**：
>
> - **Key Owner（创建 + 最终吊销）**：对密钥存在性与合规性负总责；仅 SCP 授权的身份可 `kms:ScheduleKeyDeletion` / `acm-pca:DeleteCertificateAuthority`。
> - **Rotation Owner（轮换）**：可触发每年自动 / 手动轮换；但不可删除、不可导出明文。
> - **Usage Owner（使用）**：业务域中可 `kms:Encrypt` / `kms:Decrypt` / `kms:GenerateDataKey` 的执行角色（如 ECS Task Role、Lambda Exec Role）。仅允许通过 IAM Policy + KMS Key Policy 双条件放行，禁止跨域 Usage。
> - **Emergency Revoker（紧急吊销）**：泄露 / 误发事件时，可 24/7 吊销证书 / 禁用密钥；但不可创建、不可轮换。
>
> **人员名单（示例占位，上线前填入真实姓名+邮箱，禁止共用账号）**：
>
> | 代号 | 姓名（上线前填写） | 邮箱                         | 岗位               | 可用 Owner 职能                              |
> | :--- | :----------------- | :--------------------------- | :----------------- | :------------------------------------------- |
> | P-01 | __________________ | `_______________@payease.io` | CISO / 安全 Owner  | Key Owner + Emergency Revoker                |
> | P-02 | __________________ | `_______________@payease.io` | DPO / 合规         | Key Owner（个人数据密钥类）                  |
> | P-03 | __________________ | `_______________@payease.io` | 基础设施 Owner     | Rotation Owner + Emergency Revoker           |
> | P-04 | __________________ | `_______________@payease.io` | 助贷业务负责人     | Usage Owner（Broker 域）                     |
> | P-05 | __________________ | `_______________@payease.io` | 持牌机构对接负责人 | Usage Owner（Lender 域）                     |
> | P-06 | __________________ | `_______________@payease.io` | 企业产品负责人     | Usage Owner（Employer 域 HR+FIN）            |
> | P-07 | __________________ | `_______________@payease.io` | 法务               | Emergency Revoker（CA / 签名密钥）           |
> | P-08 | __________________ | `_______________@payease.io` | 外部审计（年度）   | 只读（AWS Config / CloudTrail，无 KMS 操作） |

### 3.2 KMS CMK 授权矩阵（每域每环境至少 4 类密钥）

> 关键规则：
>
> - 多域共享密钥 = 严格禁止（broker/lender/employer 三域 CMK 永不合并，哪怕 Dev）。
> - `kms:PutKeyPolicy` 只允许 Key Owner（P-01/P-02）；其他所有人不可修改 Key Policy。
> - `kms:ScheduleKeyDeletion` 只允许 Key Owner；且必须设为最长等待期（30 天）。
> - 轮换周期：数据密钥 1 年自动；签名密钥 6 个月手动；根 CA（如有）3 年手动。

| 密钥用途                                   | 域                   | 环境 | 别名（AWS alias/）                          | Key Owner（创建/最终吊销） | Rotation Owner（轮换） | Usage Owner（加密/解密）    | Emergency Revoker | 轮换周期   |
| :----------------------------------------- | :------------------- | :--- | :------------------------------------------ | :------------------------- | :--------------------- | :-------------------------- | :---------------- | :--------- |
| RDS 数据库（PII 全量 + 薪资 + 银行卡）     | Broker               | Prod | `alias/broker-prod/rds-pii`                 | P-01                       | P-03                   | P-04                        | P-01, P-03        | 1 年自动   |
| RDS 数据库（PII 全量）                     | Lender               | Prod | `alias/lender-prod/rds-pii`                 | P-01                       | P-03                   | P-05                        | P-01, P-03        | 1 年自动   |
| RDS 数据库（HR/财务 PII）                  | Employer（HR+FIN）   | Prod | `alias/employer-prod/rds-pii`               | P-01, P-02                 | P-03                   | P-06                        | P-01, P-03        | 1 年自动   |
| S3 对账文件 / 导出 Excel / PDF 合同        | Broker               | Prod | `alias/broker-prod/s3-exports`              | P-01                       | P-03                   | P-04                        | P-01, P-03        | 1 年自动   |
| S3 对账文件 / 银行回执                     | Lender               | Prod | `alias/lender-prod/s3-settlements`          | P-01                       | P-03                   | P-05                        | P-01, P-03        | 1 年自动   |
| 员工证件 JPEG/PDF（HR 域）                 | Employer HR          | Prod | `alias/employer-hr-prod/s3-documents`       | P-01, P-02                 | P-03                   | P-06（仅 HR 子角色）        | P-01, P-03        | 1 年自动   |
| 回调签名 HMAC 密钥（机构 Lender ↔ Broker） | Broker/Lender 跨域   | Prod | `alias/broker-prod/webhook-hmac`            | P-01                       | P-03                   | P-04 + P-05（仅 Verify）    | P-01, P-07        | 6 个月手动 |
| 回调签名 HMAC 密钥（Employer ↔ Broker）    | Employer/Broker 跨域 | Prod | `alias/employer-prod/webhook-hmac`          | P-01                       | P-03                   | P-06 + P-04（仅 Verify）    | P-01, P-07        | 6 个月手动 |
| 会话 / OTP 加密（不使用明文 KVS）          | 全三域               | Prod | 按域各 1 个：`alias/<域>-prod/session-wrap` | P-01                       | P-03                   | 各域前端 API 网关 Task Role | P-01, P-03        | 90 天自动  |
| EBS / EFS 卷（操作系统级，不含 PII 明细）  | 全三域               | Prod | 按域各 1 个：`alias/<域>-prod/ebs`          | P-01                       | P-03                   | ECS 执行角色                | P-01, P-03        | 1 年自动   |

> （Dev / Staging 密钥矩阵结构同上；Key Owner 仍为 P-01/P-02，Rotation Owner P-03，Usage Owner 可放宽为对应域开发负责人。Dev 密钥轮换周期放宽至 180 天。）

### 3.3 证书 / CA 授权矩阵（如启用 PCA / 自签）

> S0 MVP 阶段建议使用公共 CA（ACM 公共证书，DV/OV）；如后续启用机构对接的双向 TLS mTLS，需填写本矩阵并签字。

| 证书类型                                | 用途                       | CA Owner（签发 + 吊销） | 证书申请者（CSR 提交） | 紧急吊销者（24/7） | 最长有效期               |
| :-------------------------------------- | :------------------------- | :---------------------- | :--------------------- | :----------------- | :----------------------- |
| 公共 TLS（管理后台 / 门户 / API）       | 入站 HTTPS                 | 不适用（ACM 公共）      | P-03                   | P-03 + P-07        | 13 个月（强制 1 年轮换） |
| mTLS 客户端证书（持牌机构回调入站）     | Lender → Broker 双向认证   | P-01 + P-07（PCA Root） | P-05                   | P-07 + P-01        | 90 天                    |
| mTLS 客户端证书（企业 HR/财务回调入站） | Employer → Broker 双向认证 | P-01 + P-07（PCA Root） | P-06                   | P-07 + P-01        | 90 天                    |
| 代码签名 / 对账文件签名 JWS             | 对账批次、导出文件防篡改   | P-01 + P-07             | P-03                   | P-07 + P-01        | 1 年                     |

**签字（PART 3 · KMS / CA 授权矩阵）**：

| 签字方                         | 我确认上述 Key Owner / Rotation / Usage / Emergency Revoker 四权严格分离、无兼任风险；人员名单在上线前已核实身份并启用硬件 MFA | 签字               | 日期       |
| :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :----------------- | :--------- |
| 安全 Owner / CISO（P-01 本人） | □ 所有 CMK 别名矩阵符合最小权限 + 域不共享；三权分立未越权                                                                     | __________________ | ____/**/** |
| 合规 / DPO（P-02 本人，如兼）  | □ 涉及个人数据的 CMK（雇主域 RDS/S3）授权正确，DPO 具备最终吊销权                                                              | __________________ | ____/**/** |
| 基础设施 Owner（P-03 本人）    | □ 轮换周期在技术上可执行（AWS KMS auto-rotation + 手动 HMAC 轮换脚本就绪）                                                     | __________________ | ____/**/** |
| 法务（P-07 本人，如兼）        | □ 紧急吊销流程已桌面演练至少 1 次（密钥泄露 + 误发证书两类场景）                                                               | __________________ | ____/**/** |
| 产品 Owner                     | □ 不要求任何跨域共享密钥 / 共用 CA 的业务功能；隔离不影响 MVP 范围                                                             | __________________ | ____/**/** |

---

## 最终：S0.2 三要素整体生效签字

> 本页签完 → 在 `main` 分支 commit 并 push `docs/SECURITY_S0_2_CHECKLIST.md`（含签字 PDF 扫描件作为附件，或签字日期栏以电子签工具记录）。
> → 签完当日：CISO 通知 Infrastructure Owner **可以**开始写 Terraform skeleton；通知产品 Owner **可以**开始规划 S1.0 MVP 真实 API 契约冻结。
>
> **三项任何一项未签字 = S0.2 不通过 = S1.0 真实后端 / 真实接口禁止启动。**

| 签字方            | 角色           | PART 1 账号边界 已签 | PART 2 区域合规 已签 | PART 3 KMS/CA 已签 |    整体生效签字    | 日期       |
| :---------------- | :------------- | :------------------: | :------------------: | :----------------: | :----------------: | :--------- |
| 产品 Owner        | Product Owner  |          □           |          □           |         □          | __________________ | ____/**/** |
| 安全 Owner / CISO | CISO           |          □           |          □           |         □          | __________________ | ____/**/** |
| 合规 / DPO        | DPO            |          —           |          □           |         □          | __________________ | ____/**/** |
| 基础设施 Owner    | DevOps / Infra |          □           |          □           |         □          | __________________ | ____/**/** |
| 法务              | Legal Counsel  |          □           |          □           |         □          | __________________ | ____/**/** |

> 归档位置：本 Markdown + 签字页扫描件 PDF → S3 合规桶（`payease-shared-services` / `s3://payease-compliance-archive/s0-2/` KMS 加密）+ Git 历史双重保留。
