# S1 预留 · 数据分类与脱敏字典 + "永不出现字段"清单

> **生效前提**：本文件定义字段分类等级、脱敏算法、以及对特定角色域**绝对禁止出现**（永不写入、永不渲染、永不导出、API 返回 403 + 触发 `DPI_EXPORT_DENIED` 审计事件）的字段集合。
>
> **红线**：任何前端 / 后端代码如果把"永不出现字段"写到了禁止出现的域，必须同时命中：
>
> 1. Semgrep 自定义规则（CI ERROR 阻断）
> 2. 运行时 RBAC + 响应拦截器（响应 403 并 `DPI_EXPORT_DENIED` 审计）
> 3. 前端渲染层拦截（渲染为 `[REDACTED]` 并控制台 error，不抛未捕获异常）

---

## 1. 数据分类等级（Data Classification Tier）

| Tier            | 中文名              | 标识前缀 | 说明                               | 加密要求                             | 跨境传输（主区↔DR / 主区↔境外）                                   | 日志/审计保留期                                  |
| :-------------- | :------------------ | :------- | :--------------------------------- | :----------------------------------- | :---------------------------------------------------------------- | :----------------------------------------------- |
| **T0 · 极高敏** | 身份核心 / 金融核心 | `T0_`    | 泄露可直接导致身份盗用 / 资金盗用  | AES-256-GCM + 独立 CMK；应用层再加密 | ❌ 严禁跨境；永不离开主区域；DR 冷备份需要 DPO + 法务双签独立流程 | 应用层永不落日志；审计事件只存 SHA-256 truncated |
| **T1 · 高敏**   | 业务高敏            | `T1_`    | 泄露可造成重大业务/合规损失        | AES-256-GCM + 域独立 CMK             | □ 仅加密 DR 冷备；绝不传输到境外                                  | 保留 90 天自动脱敏；完整保留 7 年仅合规审计可读  |
| **T2 · 中敏**   | 业务内部            | `T2_`    | 不可公开，但泄露不直接造成资金损失 | AES-256（传输层 TLS 1.3）            | ✅ 可传 DR；可在授权域间通过签名回调传输                          | 12 个月；之后 truncate 到 ID 仅保留              |
| **T3 · 公开**   | 公开信息            | `T3_`    | 市场宣传 / 品牌公开资料            | TLS（无应用层加密要求）              | ✅ 无限制                                                         | 按普通日志策略                                   |

---

## 2. 字段级分类总表（含最小单位金额要求）

| 字段名（推荐命名） | Tier | 分类说明 | CI-10 金额要求 | 域内出现允许（✓=允许 / ❌=永不出现） |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| | | | | Broker（助贷+运营） | Lender（持牌） | Employer HR | Employer FIN |
| `national_id_full`（身份证/护照全文） | T0 | 柬埔寨国民身份证 / 护照号全文 | — | ❌ | ❌ | ✓（仅本人 HR 核验页面，导出必 403） | ❌ |
| `national_id_last4` | T1 | 身份证后 4 位，用于去重核验匹配 | — | ✓ | ✓（仅 Lender 核验匹配） | ✓ | ❌ |
| `phone_number_e164`（手机号全文） | T0 | E.164 手机号（+855...） | — | ❌ | ❌ | ✓（仅本人企业通讯录） | ❌ |
| `phone_number_prefix_trunc`（号段脱敏） | T2 | 仅 +855-XX-XXXX，后 4 位 * | — | ✓（客服场景） | ✓（联系场景） | ✓ | ✓（差异工单联系） |
| `borrower_full_name`（借款人姓名） | T1 | 高棉语 + 拉丁拼写全名 | — | ✓（申请处理） | ✓（放款） | ✓（本企业 HR 核验） | ✓（本企业还款） |
| `employer_tax_id_full`（企业税号全文） | T1 | KH-EM-XXXXXX 全文 | — | ✓ | ✓（对账） | ✓（本企业） | ✓（本企业） |
| `employer_tax_id_truncated` | T2 | 仅 KH-EM-** 展示 | — | ✓ | ✓ | ✓ | ✓ |
| `monthly_base_salary_amount_minor` | **T0** | 月薪最小单位（KHR 1 riel / USD 1 cent） | ✅ `z.string().regex(/^\d+$/)`，严禁 number | ❌（Broker/运营永不看具体薪资） | ❌（Lender 只看审批后的贷款金额，不看月薪） | ✓（本企业 HR 页面） | ❌（财务对账不看个人月薪） |
| `monthly_salary_bucket`（薪资分桶） | T2 | `LOW(<300USD) / MID(300-600) / HIGH(>600)` | — | ✓（风控展示，不展示具体数） | ✓（风控评估） | ✓ | ✓ |
| `requested_loan_amount_minor` | T1 | 申请贷款金额最小单位 | ✅ `z.string().regex(/^\d+$/)` | ✓ | ✓（放款） | ✓（本企业 HR 核验申请） | ✓（本企业财务代扣） |
| `bank_account_number_full`（银行卡号全文） | T0 | 任意银行账号全文，包括 ABA/Wing/ACLEDA | — | ❌ | ❌（Lender 内部处理，不回传给 broker/employer） | ❌ | ❌ |
| `bank_account_last4`（银行卡后 4 位） | T1 | 仅对账展示，不用于转账 | — | ❌（Broker 看不到） | ✓（本机构内部） | ❌ | ✓（本企业财务对账核对） |
| `bank_account_routing_number`（银行路由码/SWIFT） | T1 | BIC / SWIFT / ABA 路由码 | — | ✓（Broker 路由到对应银行） | ✓（本机构） | ❌ | ✓（本企业财务） |
| `department_name`（部门名） | T1 | HR 组织信息 | — | ❌（Broker 运营不看组织架构） | ❌（Lender 不需要） | ✓（本企业 HR） | ❌（财务不看部门） |
| `hired_at`（入职日期） | T2 | HR 雇佣信息 | — | ✓（风控工龄因子） | ❌ | ✓ | ❌ |
| `hr_verification_internal_note`（HR 内部备注） | T1 | 含可能敏感的岗位表现备注 | — | ❌ | ❌ | ✓（本企业 HR 自己看） | ❌ |
| `broker_underwriting_memo`（助贷审批意见） | T1 | Broker 审批链路决策理由 | — | ✓（本域内部） | ✓（Lender 参考） | ❌（企业员工不该看到审批链路） | ❌ |
| `recon_difference_amount_minor`（对账差异） | T1 | 差异最小单位，可正可负 | ✅ `z.string().regex(/^-?\d+$/)` | ✓ | ✓（本机构差异） | ❌ | ✓（本企业财务） |
| `settlement_channel_ref_full`（结算流水号全文） | T1 | ABA-TRF-XXXXXXXX 全文 | — | ✓（对账） | ✓ | ❌ | ✓（本企业财务） |
| `gl_voucher_number`（总账凭证号） | T2 | 企业内部过账编号 | — | ❌ | ❌ | ❌ | ✓（本企业财务） |
| `loan_contract_pdf_sha256`（合同 PDF 哈希） | T1 | 合同原文哈希（原文落 T0 加密桶，永不跨域） | — | ✓（哈希用于审计存证） | ✓ | ✓（本企业 HR 存证） | ✓（本企业财务存证） |
| `mfa_device_serial`（MFA 设备序列号） | T0 | TOTP/FIDO 设备序列 | — | ❌（仅本人管理页可见） | ❌ | ❌ | ❌ |
| `id_token` / `access_token` / `refresh_token` / `initData` | T0 | 任何令牌/凭据（WEB-08，禁止 localStorage） | — | 永不落任何日志/响应 body | 同左 | 同左 | 同左 |

---

## 3. 脱敏算法规范（De-Identification Rules）

> **原则**：可逆加密 ≠ 脱敏；对外展示 / 跨域传输的 T0/T1 字段一律先"脱敏"（不可逆 truncate/mask/分桶），需要解密原始值必须通过独立"解密审批流程 + 双控"。

### 3.1 展示层脱敏（前端渲染规则）

| 字段         | 脱敏前（示例）                  | 脱敏后（展示）                | 算法 ID                    | 适用展示场景                                       |
| :----------- | :------------------------------ | :---------------------------- | :------------------------- | :------------------------------------------------- |
| 手机号       | `+855 12 345 678`               | `+855 12 *** 678`             | `MASK-MOBILE-KH-STAR-MID`  | Broker / Lender 联系场景                           |
| 身份证号     | `0001234567890123`（16 位高棉） | `0001********23`              | `MASK-ID-HEAD4-TAIL2-STAR` | 任何非 HR 本人页面                                 |
| 银行卡号     | `4242 4242 4242 4242`           | `**** **** **** 4242`         | `MASK-PAN-ONLY-LAST4`      | 永远不展示 PAN 前 12 位；严格 PCI                  |
| 邮箱         | `sok.dara@kh-example.com`       | `so*****@kh-example.com`      | `MASK-EMAIL-LOCAL`         | 非本人联系方式展示                                 |
| 薪资具体金额 | `1,200.00 USD`                  | `[HIGH >600 USD bucket]`      | `BUCKET-SALARY-3-TIER`     | Broker 风控面板、Lender 审批面板（不展示具体薪资） |
| HR 内部备注  | `员工本月表现优秀但有迟到 2 次` | `[REDACTED HR INTERNAL ONLY]` | `REDACT-HR-NOTE-FULL`      | 任何非 HR 本人域页面                               |

### 3.2 跨域回调传输脱敏（S1 API 契约层强制）

| 跨域方向              | 被脱敏字段                                        | 传输的替代值                                                                                      |
| :-------------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------ |
| Employer HR → Broker  | `monthly_base_salary_amount_minor`（T0 具体月薪） | 仅传输 `salary_bucket = LOW/MID/HIGH`；`requested_loan_amount_minor` 保持 T1 可传                 |
| Broker → Lender       | `national_id_full`（T0 身份证全文）               | 仅传 `national_id_last4` + SHA-256(national_id_full, salt=lender-unique-salt)，供 Lender 内部查重 |
| Broker → Lender       | `monthly_base_salary_amount_minor`（T0）          | 仅传 `salary_bucket` + 薪资分桶来源字段（HR_APPROVED 布尔），不传具体月薪                         |
| Employer FIN → Broker | `gl_voucher_number`（T2 企业总账凭证）            | 仅传 `gl_posted = true/false` + `posted_at`；具体凭证号保留企业域内部                             |
| Lender → Broker       | `bank_account_number_full`（T0 放款卡）           | 仅传 `bank_account_last4` + 结算成功/失败布尔；Broker 全程不接触 PAN                              |

---

## 4. 永不出现字段 × 域 红牌矩阵（Redcard Matrix）

> **命中 = Semgrep ERROR + CI BLOCKED + 运行时 403 + DPI_EXPORT_DENIED 审计**。
> 矩阵中 ❌ = **永远不可**出现在该域的页面/API 响应/日志/导出文件。

| 字段（T0/T1 红牌字段）                                           |    Broker（助贷+运营）     |                                      Lender（持牌）                                       |          Employer HR           |                Employer FIN                |
| :--------------------------------------------------------------- | :------------------------: | :---------------------------------------------------------------------------------------: | :----------------------------: | :----------------------------------------: |
| `national_id_full`（身份证全文）                                 |        ❌ 永不出现         |                                        ❌ 永不出现                                        | ✅（仅本人核验详情，导出必拒） |                ❌ 永不出现                 |
| `phone_number_e164`（手机号全文）                                |             ❌             |                                            ❌                                             |       ✅（本企业通讯录）       |                     ❌                     |
| `monthly_base_salary_amount_minor`（月薪全文）                   |        ❌ 永不出现         |                                        ❌ 永不出现                                        |     ✅（本企业 HR 核验页）     |                ❌ 永不出现                 |
| `bank_account_number_full`（银行卡全文）                         |        ❌ 永不出现         | ❌（即使 Lender 内部，也只在 Lender 自己的银行对接服务，不回传给 PayEase Lender 门户 UI） |               ❌               |            ❌（财务只看 last4）            |
| `hr_verification_internal_note`（HR 内部备注）                   |             ❌             |                                            ❌                                             |        ✅（本企业 HR）         |                     ❌                     |
| `broker_underwriting_memo`（助贷审批链路）                       |     ✅（Broker 内部）      |                                      ✅（Lender 看）                                      |               ❌               |                     ❌                     |
| `department_name`（部门名）                                      |             ❌             |                                            ❌                                             |         ✅（HR 内部）          |                     ❌                     |
| `gl_voucher_number`（总账凭证号）                                |             ❌             |                                            ❌                                             |               ❌               |               ✅（财务内部）               |
| 任何形式的 `jwt` / `access_token` / `id_token` / `initData` 明文 | ❌（永不落日志/响应/存储） |                                            ❌                                             |               ❌               |                     ❌                     |
| `localStorage.setItem('_token_'                                  |         '_secret_'         |                                       '_password_'                                        |      '_initData_')` 调用       | ❌（WEB-08 + Network-Zero patch 同时拦截） | ❌  | ❌  | ❌  |

---

## 5. S0.5 → S1 迁移校验 Checklist（数据分类部分）

> 在 S0.2 签字后、S1 MVP 真实接口开发前，必须逐项打勾并 CISO + DPO 双签。

- [ ] Semgrep 自定义规则 `dpi-redcard-*.yml` 已写入 `.semgrep/`，覆盖上表 10 个红牌字段 × 4 域组合，命中返回 ERROR 级别（CI BLOCKED）
- [ ] partner-contracts `HrEmploymentVerificationV1ResultSchema`、`FinanceRepaymentReconLineV1Schema` 已按上表删除红牌字段，仅保留脱敏替代字段（salary_bucket、national_id_last4、bank_account_last4 等）
- [ ] HR/财务门户渲染层新增 `RedactedField` 组件，命中红牌字段自动 `[REDACTED]`，绝不回退显示原文
- [ ] 审计事件 `DPI_EXPORT_DENIED` 的触发/告警/桌面演练脚本（P2 Tabletop）已编写
- [ ] S1 契约测试 fixture 中，每个红牌字段都有一条越权访问 → 403 + 审计事件的回归用例
- [ ] 本次分类字典已由柬埔寨当地法律顾问 + DPO 审阅并确认符合 Prakas on Personal Data Protection（如有后续立法更新）

---

**签字（v1.0 冻结基线）**：

| 签字方            | 确认                                                  | 签字               | 日期       |
| :---------------- | :---------------------------------------------------- | :----------------- | :--------- |
| CISO / 安全 Owner | □ 红牌矩阵覆盖全面；Semgrep 规则可落地                | __________________ | ____/**/** |
| DPO / 合规        | □ 字段 Tier 划分符合柬埔寨 PII 法规；跨境传输条款合规 | __________________ | ____/**/** |
| 法务              | □ 脱敏算法不可逆性与数据驻留要求已审阅                | __________________ | ____/**/** |
| 产品 Owner        | □ 红牌字段不影响 MVP 核心功能闭环                     | __________________ | ____/**/** |
