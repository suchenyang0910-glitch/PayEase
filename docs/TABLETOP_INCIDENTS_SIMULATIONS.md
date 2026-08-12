# P2-A：S0.5 阶段事件响应桌面演练剧本（Tabletop Exercises · 纯模拟）

> **演练范围**：S0.5 期间（S0.2 未签字、Terraform 未写、无任何真实后端/银行/IdP/生产数据）。
>
> **零生产影响保证**：所有剧本 100% 用 mock 数据、mock 账号、mock 回调接口、mock 对账快照执行；**绝不**连接真实 AWS 账号、真实银行 SDK、真实持牌机构回调 URL、真实员工 PII、真实 Telegram Bot Token。
>
> **每个剧本对应审计字典事件 code**（S1 启用时直接对接告警 pipeline）：
>
> - TABLETOP_KEY_LEAK_SIMULATED
> - TABLETOP_WRONG_DISBURSE_CALLBACK_SIMULATED
> - TABLETOP_ACCOUNTING_IMBALANCE_SIMULATED
> - TABLETOP_PII_UNAUTHORIZED_ACCESS_SIMULATED
>
> **S0.5 演练目标（不追求真实拦截，追求流程跑通 + 缺口识别）**：
>
> 1. 参与角色（Owner / CISO / DPO / 法务 / 客服）全员熟悉升级顺序与 RACI
> 2. 通讯渠道、密钥吊销手册、对外披露模板、法务话术的有效性纸面检查
> 3. 每个剧本至少识别 1 个流程缺口（记录在 §6 Lessons Learned 表格），作为 S1 上线前补强项
> 4. 本演练完成后，可作为 SOC2 Type I / ISO 27001 / 柬埔寨 PII 合规审计的"IR 演练已执行"证据（仅纸面）

---

## 0. 通用演练环境准备（S0.5 Mock）

| 道具/环境（均为 Mock，不触碰生产）             | 提供方式                                                                                                                  | 负责人         | 提前 24h 确认 |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :------------- | :-----------: |
| Mock KMS CMK 别名清单                          | 打印 [SECURITY_S0_2_CHECKLIST.md §3.2](file:///e:/PayEase/docs/SECURITY_S0_2_CHECKLIST.md) 表格的 0 值模板                | 基础设施 Owner |       □       |
| Mock 持牌机构回调签名密钥清单（HMAC / RSA）    | 打印占位表：`LENDER-A / LENDER-B / LENDER-C`，每方一对 test 公钥                                                          | 机构对接负责人 |       □       |
| Mock 账务对账快照（`rc-1…rc-5` + `rp-1…rp-6`） | 打印 [fin-mocks.static.ts](file:///e:/PayEase/finance-verify-portal/src/mocks/fin-mocks.static.ts) 5+6 行数据             | 财务对账负责人 |       □       |
| Mock 员工 PII 样本                             | 打印 [hr-mocks.static.ts](file:///e:/PayEase/hr-verify-portal/src/mocks/hr-mocks.static.ts) 的 nationalIdLast4 + 合成姓名 | HR 产品负责人  |       □       |
| 通讯渠道（mock 专用）                          | 独立会议房间 + 文档链接（不用任何真实 incident slack #incident-* 频道）                                                   | CISO           |       □       |
| 升级时间计时器                                 | 任何倒计时工具（T+15min / T+1h / T+4h / T+24h）                                                                           | CISO 助理      |       □       |
| 对外披露模板 v0（仅 mock）                     | 打印：持牌机构邮件模板 / 监管部门通报模板 / 员工沟通模板（全部标 [DRAFT SIMULATION ONLY]）                                | 法务           |       □       |

### 0.1 参与角色与 RACI（通用，4 个剧本共用）

> R=Responsible 执行；A=Accountable 批准；C=Consult 咨询；I=Inform 告知

| 角色               | 代号 | 升级 RACI                               |
| :----------------- | :--- | :-------------------------------------- |
| CISO / 安全 Owner  | P-01 | **A（所有剧本最终批准）**               |
| 法务 / 外部律师    | P-07 | **A（对外披露批准）** / R（起草模板）   |
| DPO / 合规负责人   | P-02 | **A（PII 泄露类通报）**                 |
| 基础设施 Owner     | P-03 | R（密钥吊销 / VPC 隔离 / DNS 切换执行） |
| 助贷业务负责人     | P-04 | I / C（持牌机构/业务影响评估）          |
| 机构对接负责人     | P-05 | R（持牌机构沟通 / 签名密钥重发）        |
| 企业产品负责人     | P-06 | I / C（企业客户影响评估）               |
| 客服主管           | —    | R（员工/企业进线话术 + 工单）           |
| 外部审计（观察者） | P-08 | I（仅记录，不参与决策，审计证据）       |

---

## 剧本 1 · KMS / Webhook 签名密钥泄露（TABLETOP_KEY_LEAK_SIMULATED）

**目标**：验证"发现 → 冻结 → 吊销 → 轮换 → 通报 → Lessons Learned"6 步 24h 闭环。

### 1.1 触发信号（Inject 给参与者）

> **T+00:00**（CISO 助理口头宣布）：
> GitHub Gist 匿名上传片段（Mock Gist URL：`https://gist.github.com/anonymous/abcdef123456mockonly`）显示以下疑似 PayEase 内部片段：
>
> ```
> # Mock 泄露片段（DRAFT SIMULATION ONLY）
> PAYEASE_BROKER_WEBHOOK_HMAC__LENDER_A = "hmac_sandbox_mock_*************************_a1b2c3d4"
> AWS_ACCESS_KEY_ID=PLACEHOLDER_ACCESS_KEY_ID       # mock id，仅演示格式
> AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY  # mock key
> ```
>
> 同时 S0.5 mock 告警系统（CISO 助理手动发）触发 2 条告警：
>
> - `GITLEAKS_SECRET_DETECTED`（commit `0000000mock`）
> - `KMS_POLICY_CHANGED`（非工作时间 02:17 UTC+7，Mock CMK alias `alias/broker-prod/webhook-hmac` 策略 新增 Principal `arn:aws:iam::000000000000:user/hacker-x` — 占位，非真实）

### 1.2 剧本步骤（每步建议时间：T+n）

| 步骤                     | T+时间  | 执行人           | 检查项（演练主持人逐个念）                                                                                                                  | 通过？(Y/N/Gap) |
| :----------------------- | :-----: | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------: |
| 1.1 升级申报             | T+00:15 | CISO             | 已建立独立 incident 房间；已宣布 TABLETOP，未启用任何真实生产冻结按钮                                                                       |        □        |
| 1.2 影响评估             | T+00:30 | DPO + P-04/05/06 | 被泄露密钥对应域：broker/lender/employer？影响多少企业/持牌机构？（用 Mock 数量回答）                                                       |        □        |
| 1.3 临时冻结             | T+00:45 | P-03             | **Mock KMS 操作**：在 SECURITY_S0_2_CKECKLIST §3.2 打印件上，对受影响 alias 打 ✗ "DISABLED"；Mock 禁用所有受影响 IAM user（用便签贴住代号） |        □        |
| 1.4 吊销 + 轮换          | T+01:00 | P-03 + P-05      | Mock 吊销 HMAC（Lender-A）：记录旧 HMAC SHA-256 指纹，发放新 HMAC；Mock 启动 KMS CMK 自动轮换（在打印件上勾选 Rotation Owner）              |        □        |
| 1.5 受影响方通报（Mock） | T+04:00 | P-07 + P-05      | Mock 邮件发送：Lender A / 企业端 X 家；Mock 监管通报：柬埔寨 PII 监管机关 72h 内通报模板                                                    |        □        |
| 1.6 根因 + 证据          | T+12:00 | P-01             | Mock 根因：`Developer X 误把 .env.local 提交到 public fork`（仅故事线）；证据链打印封存（贴到演练记录本）                                   |        □        |
| 1.7 Lessons Learned 记录 | T+24:00 | 全体             | 填入 §6 表格，至少 1 项补强（如"开发机强制 .env 前缀 gitleaks rule 升级为 ERROR"）                                                          |        □        |

### 1.3 通过标准（本剧本完成要求）

- [ ] 升级时间 T+15min 内房间建立
- [ ] 4h 内至少 2 份对外 Mock 通报模板被法务签字
- [ ] 至少识别 1 个流程缺口（§6 有记录）
- [ ] 全程未任何人试图连接真实 AWS / 真实密钥 / 真实 Lender 邮箱

---

## 剧本 2 · 持牌机构错误放款回调入账（TABLETOP_WRONG_DISBURSE_CALLBACK_SIMULATED）

**目标**：验证"回调验签失败 → 幂等去重 → 入账冻结 → 差异工单 → Lender 对账确认"5 步闭环。

### 2.1 触发信号（Inject）

> **T+00:00**（财务负责人宣布）：
> Finance 门户 mock 对账列表新增 1 行 `rc-999`（不在 mock 静态数据里，临时插入占位便签）：
>
> ```
> rc-999 · LENDER-A · app-0007（原 rp-7，不在 MOCK_REPAYMENT_ROWS）
> expectedAmountMinor = "0"        # 本行不应有放款
> settledAmountMinor  = "500000000" # 错误入账 5,000,000 KHR
> diff = moneySub(expected, settled) = "-500000000" KHR
> status = UNMATCHED
> ```
>
> 同时回调签名校验记录（Mock 打印单）显示：
>
> - 回调 1（T-02:00）：`x-payease-signature` = 合法（Lender-A 正确 HMAC）
> - 回调 2（T-01:58，2s 内重放）：`x-payease-idempotency-key` 与回调 1 相同 → 应返回 200 但不重复入账
> - **Mock 缺陷**：系统幂等键逻辑 bug，回调 2 重复入账了 **2 次** → 合计 3 倍 15,000,000 KHR？（CISO 助理临时改数，给剧本制造复杂场景）

### 2.2 剧本步骤

| 步骤                             |   T+    | 执行人       | 检查项                                                                                                                                  | 通过？ |
| :------------------------------- | :-----: | :----------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| 2.1 差异检测告警                 | T+00:05 | 财务负责人   | Finance mock 门户 `/reconciliation` 已看到 rc-999 red badge；已喊出"疑似错误放款"                                                       |   □    |
| 2.2 入账冻结                     | T+00:20 | P-03（Mock） | 在 mock 账务流水表上，把所有 Lender-A 当日后续入账打 ✗ "HOLD"（便签贴住）                                                               |   □    |
| 2.3 回调日志溯源（Mock）         | T+00:45 | P-05         | 从 mock 回调日志打印件中，找出 3 次重复的 `x-payease-idempotency-key`；验签全部通过 → 根因在幂等层                                      |   □    |
| 2.4 差异工单创建                 | T+01:00 | 财务负责人   | 创建 mock 工单：`diff-rc-999`，归属 Lender-A 联系人（mock 邮箱），状态 = DIFF_PENDING                                                   |   □    |
| 2.5 Lender 对账确认（Mock 电话） | T+02:00 | P-05 + P-07  | 与 Lender-A mock 联系人电话脚本：① 告知金额错误 ② 要求提供反方向冲正回调（带新幂等键 + correct negative amount） ③ 法务审阅后发邮件确认 |   □    |
| 2.6 冲正入账（Mock）             | T+04:00 | P-05         | 收到 Lender-A mock 冲正回调（amountMinor = "-500000000"，×3 冲 = "-1500000000"） → rc-999 转回 status = DIFF_RESOLVED                   |   □    |
| 2.7 Lessons Learned              | T+08:00 | 全体         | 至少识别 1 个缺口（例：幂等键 TTL 应强制 24h；重复入账阈值告警应 30s 内，而非次日批处理）                                               |   □    |

### 2.3 通过标准

- [ ] 识别回调与幂等键问题（2.3 过）
- [ ] 冲正前后所有金额均以 `CI-10 amountMinor 字符串` 表示（不用 number，不用 decimal）
- [ ] 差异工单状态机：UNMATCHED → DIFF_PENDING → DIFF_RESOLVED 完整流转

---

## 剧本 3 · 总账账务不平（Trial Balance ≠ 0）（TABLETOP_ACCOUNTING_IMBALANCE_SIMULATED）

**目标**：验证"批次差异定位 → 金额字符串精度审计 → 过账反冲 → 报表重算 → 审计留痕"5 步。

### 3.1 触发信号（Inject）

> **T+00:00**（财务负责人宣布）：
> S0.5 mock 总账批次 `GL-BATCH-2026-08-12-001`（POSTED_TO_GL 状态）生成 trial balance：
>
> ```
> 借（Debit） sum(amountMinor KHR) = "287500002"
> 贷（Credit）sum(amountMinor KHR) = "287500000"
> 净差异 = moneySub(debit, credit) = "2" KHR   ← 只有 2 riel，但不平必须全部追查
> ```
>
> 差异极小，疑似：
>
> - 候选 A：`moneySum([rowA, rowB, rowC])` 中某行用了 JS `Number(amountMinor)` → Big.js vs Number 精度差 2
> - 候选 B：某银行 rounding 规则（HALF_UP vs HALF_EVEN）不一致
> - 候选 C：`rc-2` 手动改 `differenceAmountMinor = "5"` 时，GL 侧写成 `"3"`

### 3.2 剧本步骤

| 步骤                 |   T+    | 执行人                         | 检查项                                                                                                                                                        | 通过？ |
| :------------------- | :-----: | :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| 3.1 冻结该 GL 批次   | T+00:10 | 财务负责人                     | 打印 GL-BATCH-2026-08-12-001 封面，打 ✗ "HOLD—反冲待办"；当天不允许任何其他 POSTED_TO_GL 过账                                                                 |   □    |
| 3.2 金额精度审计     | T+00:45 | P-06（企业财务）+ P-03（工程） | 工程侧 mock 审查：对 diff-calc.ts / moneySum moneySub 各调用位点，抽查 5 行 mock recon 数据，所有 amountMinor 类型为 string（在打印件勾选）；寻找 number 误用 |   □    |
| 3.3 差异行定位       | T+01:30 | 财务负责人                     | 定位到 `rc-998`（临时造）：GL 入账 difference = "3" KHR，而 Finance 门户 `/reconciliation` 显示 = "5" KHR → 根因"GL 录入 typo"                                |   □    |
| 3.4 反冲分录（Mock） | T+02:00 | 财务负责人                     | 做一笔记账反冲：Debit "2" KHR（红字，amountMinor = "-2"），对应冲回；新批次状态 = DIFF_RESOLVED                                                               |   □    |
| 3.5 报表重算并比对   | T+03:00 | 财务负责人                     | 重新跑 GL-BATCH，Debit == Credit == "287500000" → Trial Balance == 0                                                                                          |   □    |
| 3.6 留痕与通报       | T+04:00 | 法务 + CISO                    | 审计事件字典：记录 `FINANCE_GL_POST_BATCH_TRIGGERED` + `RBAC_ROLE_UPDATED`（如果改了 GL 权限）两条 mock 审计事件 Envelope（手填 JSON 草稿纸），DPO 审阅签字   |   □    |
| 3.7 Lessons Learned  | T+06:00 | 全体                           | 至少识别 1 项补强（例：POSTED_TO_GL 前，CI-10 守卫必须对每个 amountMinor 跑 Zod string regex，否则自动 BLOCK）                                                |   □    |

### 3.3 通过标准

- [ ] 所有金额操作完全遵守 CI-10：字符串 + Big.js，任何一步使用 number 都视为根因候选
- [ ] 反冲前后 audit trail 连续可追溯（mock 手填即可，但 3 个动作都有 Envelope JSON）
- [ ] 2 riel 小差异也全流程追查，不因为"金额太小"直接忽略

---

## 剧本 4 · 证件 / PII 未授权访问（TABLETOP_PII_UNAUTHORIZED_ACCESS_SIMULATED）

**目标**：验证"越权访问阻断（DPI_EXPORT_DENIED）→ 访问者溯源 → 证据冻结 → 72h 监管通报 → 权限回收 + 双控增强"6 步。

### 4.1 触发信号（Inject）

> **T+00:00**（CISO 助理宣布）：
> Mock 审计流出现 3 条连续高敏事件：
>
> ```json
> [
>   {
>     "eventCode": "VIEW_SALARY_FULL_AMOUNT",
>     "actor": { "role": "broker-officer", "id": "mock-user-014" },
>     "target.resourceType": "employment-verification",
>     "outcome": "BLOCKED"
>   },
>   {
>     "eventCode": "VIEW_BANK_ACCOUNT_FULL",
>     "actor": { "role": "broker-officer", "id": "mock-user-014" },
>     "target.resourceType": "repayment",
>     "outcome": "SUCCESS"
>   },
>   {
>     "eventCode": "EXPORT_BORROWER_PII_BATCH",
>     "actor": { "role": "broker-officer", "id": "mock-user-014" },
>     "target.resourceType": "export-file",
>     "outcome": "FAILURE__MISSING_DUAL_APPROVAL"
>   }
> ]
> ```
>
> **异常点**：
>
> - broker-officer **绝不应该** VIEW_BANK_ACCOUNT_FULL（按 [DATA_CLASSIFICATION_DEIDENTIFICATION.md §4 红牌矩阵](file:///e:/PayEase/docs/DATA_CLASSIFICATION_DEIDENTIFICATION.md) ❌ Broker 域）
> - EXPORT_BORROWER_PII_BATCH 因为缺第二审批人而 FAILURE，这是预期阻断，但 VIEW_BANK_ACCOUNT_FULL 竟然 SUCCESS，说明 RBAC 配置有漏洞（mock）

### 4.2 剧本步骤

| 步骤                             |           T+           | 执行人                  | 检查项                                                                                                                                                                                                                                             | 通过？ |
| :------------------------------- | :--------------------: | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| 4.1 访问者会话强制下线（Mock）   |        T+00:05         | P-03                    | 在 mock RBAC 矩阵打印件上，mock-user-014 打 ✗ "FORCE LOGOUT"；当天该账号所有会话 TTL 改为 0                                                                                                                                                        |   □    |
| 4.2 证据冻结（Mock）             |        T+00:20         | P-01 + P-08（审计观察） | 打印 3 条审计事件 JSON，加盖"SIMULATION EVIDENCE"章，贴到演练本；计算 3 条 JSON 的 SHA-256（手填 mock 哈希即可）并由外部审计观察员签字确认                                                                                                         |   □    |
| 4.3 受影响 PII 范围评估          |        T+00:45         | DPO                     | VIEW_BANK_ACCOUNT_FULL 访问了 mock 多少条？回答：rp-1~rp-6 中 3 条（Sok Dara / Chea Srey Mom / Horng Piseth，全 mock 名）；银行全 PAN 实际没有真数据，范围评估结论为"Mock 0 真实用户暴露"                                                          |   □    |
| 4.4 权限根因与即时修复（Mock）   |        T+01:30         | P-01                    | 对照 [ROLE_RBAC_MATRIX.md §2.2 Broker 域页面矩阵](file:///e:/PayEase/docs/ROLE_RBAC_MATRIX.md)：确认 `VIEW_BANK_ACCOUNT_FULL` 对 broker-officer 应返回 **403**；在打印矩阵上打 Δ "BUG FOUND"，标注"broker RBAC policy 误带 bank_account_full:view" |   □    |
| 4.5 企业/Lender 客户通报（Mock） | T+24:00（要求 72h 内） | 法务 + P-06             | Mock 通报邮件模板：                                                                                                                                                                                                                                |

> - 企业客户 1 家（mock@employer-sample.test）："发生 1 次疑似越权访问，访问内容为 mock 占位银行卡号（不是贵司真实数据），已立即强制下线并做 RBAC 修复。"（DRAFT SIMULATION ONLY 水印）
> - 持牌机构 Lender A："贵方 mock 结算卡 3 条占位号被 broker 侧 1 次误访问，真实号不受影响，见附件 SHA-256 证据。"
>   法务审阅后签字 | □ |
>   | 4.6 监管通报（Mock，如触发柬埔寨 PII 法） | T+72:00 内 | DPO + 法务 | 填写 mock 监管通报表格（DRAFT ONLY）：通报机关 × 受影响人数（0 真实）× 补救措施 × 报告人 DPO 签字 | □ |
>   | 4.7 长期补强：强制双控 | T+1 周（模拟） | P-01 + P-07 | 所有银行账号全 PAN 查看 + PII 批量导出，必须双控（RBAC 双审批）；在 [AUDIT_EVENT_DICTIONARY.md §2 双控清单](file:///e:/PayEase/docs/AUDIT_EVENT_DICTIONARY.md) 打印件上，补一项"VIEW_BANK_ACCOUNT_FULL 纳入双控"（便签贴） | □ |
>   | 4.8 Lessons Learned | T+1 周（模拟） | 全体 | 至少 1 项流程缺口（例：RED CARD 字段 × 域的 Semgrep 规则要覆盖 API 响应层，不只覆盖前端渲染层） | □ |

### 4.3 通过标准

- [ ] 72h 内 3 类"对外通报模板"都有法务签字（mock）
- [ ] `VIEW_BANK_ACCOUNT_FULL` 纳入双控（本演练补强项）
- [ ] 证据冻结哈希有 DPO + 外部审计双签（mock 签）

---

## 5. 演练执行记录（每次演练单独填 1 份）

| 元信息                                         | 填写（S0.5 首次桌面）                                                       |
| :--------------------------------------------- | :-------------------------------------------------------------------------- |
| 演练编号                                       | `TTX-S0.5-20260812-01`（示例占位）                                          |
| 剧本执行范围                                   | □ 剧本 1 密钥泄露 □ 剧本 2 错误放款回调 □ 剧本 3 账务不平 □ 剧本 4 证件越权 |
| 日期                                           | ____/**/** UTC+7                                                            |
| 时长（每剧本）                                 | ~ 2h / 每剧本；合计 8h（可分 4 天下午）                                     |
| 参与人（代号签字）                             | P-01__ P-02__ P-03__ P-04__ P-05__ P-06__ P-07__ P-08(审计)__               |
| 每剧本识别缺口数（>0 算通过，等于 0 算未深挖） | 剧本 1__ 剧本 2__ 剧本 3__ 剧本 4__                                         |
| 主持人                                         | CISO 助理（代号：___）                                                      |
| 批准人（CISO + 法务双签）                      | __________________ __________________                                       |

---

## 6. Lessons Learned 汇总表（S1 上线前关闭项）

|  #  | 来自剧本        | 缺口描述（What）                                          | 根因 5 Whys 简述（Why）                                                                | 补强动作（How）                                                                                                                    | Owner 代号  | 目标关闭日期 | 状态 (Open/Closed) |
| :-: | :-------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :---------: | :----------: | :----------------: |
|  1  | 剧本 1 密钥泄露 | 例：`.env.local` 文件类型在 gitleaks 规则中目前仅 WARN    | 开发者 fork 时习惯把 .env 加到 public repo；没有 pre-commit 强制 hook                  | 升级 gitleaks entropy `.env*` 为 ERROR；IDE 插件"detect-secrets"入职必装                                                           | P-03 + P-01 |  ____/**/**  |        Open        |
|  2  | 剧本 2 错误放款 | 例：幂等键没有强制 TTL 24h；2s 内重放 2 次也入账          | 代码把 `Date.now()` 当作 idempotency key 一部分，但不同机器 clock skew 2s 导致去重失败 | idempotency key 必须 UUID v4 + 服务端缓存 24h Redis（S1 项）；同 key 返回 200 但不写库                                             | P-05 + P-03 |  ____/**/**  |        Open        |
|  3  | 剧本 3 账务不平 | 例：POSTED_TO_GL 前没有 CI-10 Zod 守卫自动过              | 财务侧手工改 Excel 上传；流程不经过 Zod schema 层                                      | GL 上传接口统一走 FinanceRepaymentReconLineV1Schema.parse；任何 number 直接返回 400 审计 BLOCKED                                   | P-06 + P-03 |  ____/**/**  |        Open        |
|  4  | 剧本 4 证件越权 | 例：RED CARD 字段 × 域检查只在前端做，后端 API 响应层漏做 | 早期 MVP 开发把"前后端都校验"省掉，只做前端 mask                                       | API Gateway 层加统一 ResponseInterceptor：命中 DATA_CLASSIFICATION_DEIDENTIFICATION.md §4 红牌矩阵的，直接 403 + DPI_EXPORT_DENIED | P-01 + P-02 |  ____/**/**  |        Open        |
|  5  | （自填）        |                                                           |                                                                                        |                                                                                                                                    |             |  ____/**/**  |        Open        |
|  6  | （自填）        |                                                           |                                                                                        |                                                                                                                                    |             |  ____/**/**  |        Open        |

---

## 7. 合规归档（模拟，S0.5 纸面证据）

演练完成后，以下材料全部打印装订签字，放在合规档案册 `PayEase-TTX-S0.5-2026Q3` 位置：

- [ ] 每个剧本的通过标准 checklist 全部打勾
- [ ] §5 演练执行记录 CISO + 法务签字
- [ ] §6 Lessons Learned 至少 4 条（每剧本至少 1 条）且 Owner 明确
- [ ] 证据冻结 SHA-256 清单（剧本 4 要求）
- [ ] 对外通报 mock 模板法务签字页（剧本 1/2/4）
- [ ] S0.2 签字完成后，S1 真实 IR 演练计划（首次真实环境演练，不碰生产数据，走 Staging 隔离沙箱）

> **本页签完，才能解除 "IR 演练未执行" 的 S1 上线阻断项。**
