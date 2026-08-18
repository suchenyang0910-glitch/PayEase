# P2-E：Web3 结算预研（web3-settlement 隔离域 · 纯研究，不接钱包/链/稳定币）

> **阶段**：S0.5 / S1.0 期间**绝不落地任何链上代码**；本文件仅为决策输入用的预研文档，用于产品 Owner + CISO + 法务 + 监管合规 4 方联合评估是否在 S2 阶段投入 MVP 级别实验。
>
> **严禁触发的 6 类操作（本文件写完即永久禁止在 S0/S1 执行）**：
>
> 1. 安装 / import 任何 Web3 SDK（ethers.js / viem / web3.js / walletconnect / wagmi）
> 2. 生成任何真实 Mnemonic / Private Key / Wallet Address / Seed Phrase（即使测试网）
> 3. 发起任何 EVM / Solana / Cosmos RPC 调用（哪怕是 free RPC endpoint）
> 4. 部署任何 Solidity / Rust / Move 智能合约；审计任何真实审计报告
> 5. 铸造 / 持有 / 转账任何稳定币 / 主网币 / 测试网币 / NFT
> 6. 集成 WalletConnect / MetaMask / Telegram Wallet / Tonkeeper / Khmer 本地钱包
>
> **启用条件（唯一解锁路径）**：
> ① S0.2 签字包完成 5 人签字 + PDF 归档；② S1.0 MVP 在传统法币通道（ABA/Wing/ACLEDA/PayWay）柬埔寨本地跑通 6 个月闭环且零账务不平；③ 柬埔寨国家银行（NBC）稳定币 / 加密资产监管框架书面确认 PayEase 经营活动合规；④ 法务 + DPO + 持牌机构代表联合签署 "S2 可启动 Web3 沙箱 POC" 文件。4 项缺一不可。

---

## 0. 预研背景：为什么考虑 Web3 结算（为什么不一定需要）

### 0.1 业务驱动（若满足，才有 Web3 价值；不满足 → Web3 纯 overhead）

| 业务场景                                                            | Web3 价值（相对传统法币通道）                                                                                                         | 若不满足 → 是否可以不用 Web3                                                                       |
| :------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------- |
| **场景 A：24/7 跨时区 Lender 放款对账**                             | 链上交易 24/7 可验证，不依赖银行工作日；settlement finality 秒级；银行转账批处理 2-3 天                                               | 若 Lender 都在柬埔寨本地、ABA/ACLEDA 批量转账工作日 T+0，则 Web3 价值低 → 不做                     |
| **场景 B：跨国 Lender（新加坡/泰国/越南）→ 柬埔寨企业员工还款回款** | 稳定币跨境清结算 T+0 秒到账，传统 SWIFT T+2~5 + 中间行费 0.2-2%；链上可验的 hash 可作为对账凭证                                       | 若 S2 仍只有柬埔寨本地 Lender，跨境 0 → Web3 无价值 → 不做                                         |
| **场景 C：链上不可篡改放款凭证（Verifiable Credential）**           | 借款人持有链上 VC 证明「我已按时还清 N 笔贷款」用于未来利率折扣 / 企业 HR 证明 / 其他持牌机构跨机构数据共享；零知识证明不暴露收入细节 | 若无跨机构 VC 生态，单机构自己做 → Web3 无意义；数据库 + 签名 PDF 即可                             |
| **场景 D：账务不平时多签名（Multi-Sig）调解**                       | 3 方（Broker + Lender + PayEase Ops）Multi-Sig 智能合约，差异冲正必须至少 2 方签名；审计链上全留痕，无人可改                          | 若 S1.0 Multi-Sig 权限系统（IAM + RBAC 双控）已经足够可靠 → Web3 增加复杂度                        |
| **场景 E：稳定币支付柬埔寨员工薪资（未来方向）**                    | 员工直接拿稳定币领工资，兑换 riel / USD 本地钱包；比银行代发手续费低 1-3%                                                             | 若柬埔寨本地稳定币流通环境 / 员工 KYC / NBC 发牌 三件事任何一件不成熟 → 合规风险 > 成本节省 → 不做 |

### 0.2 预研结论前置（推荐默认）：S1.0 不接 Web3，S2 根据实际场景 A/B/C/D/E 满足情况 4 方复评

---

## 1. 隔离域设计：web3-settlement 作为**物理独立第四域**（不污染现有三域架构）

> 若未来启用 Web3，必须作为独立的第四域 `web3-settlement-domain`，与现有 Broker / Lender / Employer 三域严格隔离，延续 S0.2 签字包的账号边界 + AssumeRole 白名单模式。

### 1.1 域架构（与 S0.2 签字包对齐的 AWS 账号边界）

| 域             | 独立 AWS 账号（Dev/Staging/Prod）    | VPC CIDR（必须与三域 deny-all peering）            | KMS CMK 别名（必须独立，不共用 Broker/Lender CMK）                                                               |
| :------------- | :----------------------------------- | :------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `web3-dev`     | `payease-web3-dev`（新账号占位）     | `10.32.0.0/16`（与 Broker/Lender/Employer 不重叠） | `alias/web3-dev/rpc-gateway-key` / `alias/web3-dev/multisig-wallet-1-key`                                        |
| `web3-staging` | `payease-web3-staging`（新账号占位） | `10.33.0.0/16`                                     | `alias/web3-staging/rpc-gateway-key` / `alias/web3-staging/multisig-wallet-1-key`                                |
| `web3-prod`    | `payease-web3-prod`（新账号占位）    | `10.34.0.0/16`                                     | `alias/web3-prod/rpc-gateway-key` / `alias/web3-prod/multisig-wallet-1-key` / `alias/web3-prod/vc-issuer-ca-key` |

### 1.2 跨域调用矩阵（默认 deny-all，仅白名单 3 条 RPC 路径）

| 调用方向                    | 允许的 API / 动作（极少，越细越好）                                                                                                             | 不允许（必须 403 + 审计 DPI_EXPORT_DENIED）                                        |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| Broker 域 → Web3 域         | ① `POST /web3/v1/disbursement-proof/submit`（上传放款 Tx Hash，做凭证）② `GET /web3/v1/disbursement-proof/:id/status`（查凭证是否上链）         | 所有私钥 / Mnemonic 查询；所有智能合约部署；所有稳定币 transfer 指令从 Broker 发起 |
| Finance/Lender 域 → Web3 域 | ① `POST /web3/v1/reconciliation-proof/submit`（上传对账快照 hash）② `GET /web3/v1/vc/borrower/:id/verify`（验证链上 VC）                        | Finance 域直接发起转账；私钥读；钱包地址创建                                       |
| Employer 域 → Web3 域       | **全部拒绝**（Employer 域绝不能有任何 Web3 出口；员工 VC 只能由 Borrower 自己查看，Employer 只能查看授权过的零知识 proof，不能拿 raw 链上数据） | 全部 ❌                                                                            |
| Web3 域 → 其他三域          | 仅通过 SQS / SNS 异步通知（"proof 已上链 / proof 验证失败"）；**绝不直接调用 Broker/Lender 内部 API**                                           | 直接 HTTP 内网调用 RDS / IAM / KMS                                                 |

### 1.3 三域物理隔离 Checklist（S0.2 签字后，若继续 Web3，写进 SECURITY_S0_2_CHECKLIST.md 的 PART 1 新增段落）

- [ ] 3 个 web3 AWS 账号独立，不与 Broker/Lender/Employer 用同主账号 OU（新 OU = `OU=Web3, OU=PayEase`）
- [ ] VPC peering 在 4 域（Broker/Lender/Employer/Web3）之间 **deny-all**；Web3 出公网仅通过独立 NAT Gateway，流量经过独立 WAF 规则（RPC endpoint allowlist only）
- [ ] KMS CMK 创建 Owner 必须与 Broker/Employer Owner **不是同一个人**（延续 S0.2 四权分离原则）
- [ ] Web3 域 RDS 仅存 链上 hash / Tx / VC ID（零 PII）；任何 `nationalId / salary / bankAccount` 写入 Web3 RDS 尝试 → Semgrep ERROR + CI BLOCK + 实时告警
- [ ] Web3 域所有出公网 RPC 调用 **必须经过内部 RPC Gateway**（不能直接走 public Infura/Alchemy；内部 Gateway 加 allowlist：只允许特定 method `eth_chainId / eth_getTransactionReceipt / eth_call`，`eth_sendRawTransaction` 只能通过 Multi-Sig 冷签流程）

---

## 2. 稳定币结算风险矩阵（为什么 S1 不建议用；S2 沙箱仅允许 2 类稳定币 + 强制风控 10 条）

### 2.1 风险分类（按柬埔寨 PayEase 业务特性定制）

| 风险                                                                                                                                                                                 |               严重度               |                       可能性（S2 沙箱前）                       | 缓解措施（至少 3 条才能降为 Low）                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------: | :-------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **稳定币脱锚（Depeg）风险**：如 USDC/USDT 短时跌至 $0.95 甚至 $0.90，导致放款 100K USD 实际购买力仅 95K USD，员工实际拿到 5K USD 损失                                                |            **Critical**            | Medium（历史上发生过 3 次 USDC Silicon Valley Bank 脱锚 ~0.87） | ① 只允许 **1:1 法币储备定期审计** 的稳定币（如 Circle USDC 储备证明每月发布，TrueUSD）；算法稳定币一律禁 ② 结算 TTL = 5min；超过 5min 的挂单自动 cancel ③ 价格预言机 Chainlink + 2 家本地中心化交易所做 3-out-of-5 median 脱锚阈值 0.5% 立即 halt                                                                                                                                                                                                       |
| **智能合约漏洞**（稳定币合约 / Multi-Sig / 冲正合约被 re-entrancy / front-run / oracle 篡改）                                                                                        |            **Critical**            |                             Medium                              | ① S2 只允许用已审计 + TVL > $10B 的成熟合约（如 Gnosis Safe v1.3+，不能自己写）；自己写的合约 2 家独立审计公司 + 1 家柬埔寨本地合规审计 ② bug bounty Immunefi 至少 $100K Critical reward ③ 所有合约 24h Timelock（重大参数变更必须 24h 后生效，Ops 可紧急暂停）                                                                                                                                                                                         |
| **合规 / 监管风险（NBC 未发牌）**：柬埔寨 NBC 2024 年已禁止未授权 crypto 交易；PayEase 作为持牌助贷/金融科技业务，未获 NBC 书面批准前，任何稳定币结算可能被视为非法金融活动          | **Blocker**（未取得书面 = 直接停） |                              High                               | ① 必须取得 NBC "创新沙箱 / 监管 sandbox" 书面同意，范围仅限 "员工还款回款 Lender→PayEase 稳定币通道"，不涉及员工直接持有或交易 ② 稳定币 100% 自动 24h 内兑换为 riel / USD 存入监管银行账户；PayEase 资产负债表 **绝不持有任何稳定币超过 24h** ③ 与合作 Lender 签署补充协议：「稳定币脱锚损失由 Lender 承担」，PayEase 仅为技术通道                                                                                                                      |
| **私钥 / Multi-Sig 丢失与泄露**：Mnemonic 泄露 / 被盗 → 稳定币不可撤销转出；Multi-Sig 3-of-5 两个 Owner 同时离职 → 资金冻结                                                          |            **Critical**            |                              High                               | ① 24h 内兑换法币原则（上条） → 即使泄露，热钱包余额极低 ② Mnemonic 用 AWS CloudHSM（非 KMS，用 HSM 物理隔离）加密 + 2 份纸质备份分存 2 个柬埔寨不同物理城市的银行保险柜 + 1 份 AWS S3 Glacial（KMS envelope encrypt） ③ Multi-Sig 5-of-9（Web3 Owner + Ops + CISO + 法务 + 2 位 Lender + 2 位 Employer + 审计观察员 共 9 人，5 签通过）；离职即重签轮换 ④ 紧急吊销机制（S0.2 PART 3 紧急吊销责任人有权调用 `contract.pause()` + `emergencyWithdraw()`） |
| **链上隐私泄露**：链上 Tx 公开透明，可通过 `from/to address + amountMinor 字符串 + 时间` 反推员工身份 / 薪资 / 贷款金额，违反 DATA_CLASSIFICATION_DEIDENTIFICATION.md T0/T1 字段要求 |              **High**              |                              High                               | ① 链上只存 `H(loan_ref                                                                                                                                                                                                                                                                                                                                                                                                                                  |     | secret_salt)` 哈希，**绝不**存 borrowerFullName / nationalIdLast4 / salary 明文 ② VC 采用 ZK-SNARK（如 Semaphore / MACI 或 Polygon ID）只证明「该地址持有人有按时还清 3 笔记录」而不披露具体金额 / 时间 / Lender ③ 对外链上查询只能通过 0-knowledge proof，不暴露 raw hash；链上数据只能由 2 家持牌审计机构走审计专用节点导出 |
| **前端钱包 SDK supply chain attack**：ethers.js / viem / wagmi 依赖被投毒（如 event-stream 事件）→ 盗取 private key / initData / 签名                                                |              **High**              |                             Medium                              | ① 所有 SDK 必须 pin 精确版本 + SBOM + 许可证快照（S0.5 P1b 前端依赖升级策略扩展到 Web3） ② 代码中任何出现 `privateKey = "0x..."` / `Wallet.fromMnemonic(...)` → Gitleaks ERROR ③ 所有链上操作**只能由冷签 Multi-Sig 发起**，前端浏览器**绝不持有任何私钥**（只持有 session 级别的 VC，不碰钱包）                                                                                                                                                        |
| **对账差异回滚困难**：链上 Tx 不可逆，传统账务中「rc-2 差异 5 KHR → 自动冲正 5 riel」Web3 下要么有专门冲正合约，要么无法撤销 → 导致差异工单增加 30% 以上                             |             **Medium**             |                             Medium                              | ① 所有链上结算 1.5% 精度容差（小于 KHR riel 最小单位 + $1）之外的差异，必须由 Multi-Sig 合约发出 `refundTx`，不能单独回滚 ② 链上 Tx 做 reference 字段（与内部 recon_id 哈希映射）；差异工单系统直接读映射关系 ③ S1 阶段先在传统系统做 100% 对账闭环 + SLA（差异工单 4h 处理完成）成熟后，才考虑上链                                                                                                                                                     |
| **流动性风险（稳定币 → riel 兑换通道深度不足）**：柬埔寨本地 riel 稳定币对的 24h 交易量不足 $1M，大额放款 $500K 一次性兑换 → slippage 0.8-1.5% = $4K-$7.5K 损失                      |             **Medium**             |             Low（S2 前流量小，$500K 级大额概率低）              | ① 最大单笔 $50K；每日上限 $200K；超过阈值走传统银行通道作为 fallback ② 与本地 2 家持牌交易所签 OTC 深度协议，提供 slippage cap 0.2% ③ S2 沙箱阶段仅做 $1-$1000 小流量实验，不碰真实大额放款                                                                                                                                                                                                                                                             |

### 2.2 S2 沙箱仅允许的 2 类稳定币（其他一律 BLOCK）

1. **Circle USDC（ERC-20 / Polygon / Solana 三选一，仅一个链）**：储备证明每月由 Grant Thornton 审计；Chainlink 脱锚监控。推荐 S2 首选 Polygon（gas 费最低）。
2. 未来柬埔寨央行（NBC）若发行 **Bakong 稳定币 / CBDC**：优先级最高，替换 USDC。优先采用央行 CBDC 通道，避开商业稳定币全部脱锚与合规风险。

---

## 3. 链上凭证（Verifiable Credential）边界：什么能上链 · 什么绝对不能上链

> **底线（写入审计字典 RED CARD）**：任何能识别到具体员工 / 具体薪资 / 具体银行卡的字段 → **绝不**上链；链上仅存**哈希值 + ZK proof public inputs**。

| 字段类别                                             | 能不能上链？（Y/N） | 若 Y，形式                                                                              | 典型用途                                          |
| :--------------------------------------------------- | :-----------------: | :-------------------------------------------------------------------------------------- | :------------------------------------------------ |
| `loanRef`（内部 ID `ev-0000...`）                    | N（可反推内部系统） | 仅存 `SHA-256(loanRef                                                                   |                                                   | nonce_web3_secret)`                | 用于对账 mapping，不暴露内部 ID          |
| `borrowerFullName`                                   |     **绝对 N**      | —                                                                                       | 任何泄露立即 CISO 告警 + 停链                     |
| `nationalIdFull / nationalIdLast4`                   |     **绝对 N**      | —                                                                                       | 即使 last4 + 其他字段组合也能重识别               |
| `monthlyBaseSalaryAmountMinor`                       |     **绝对 N**      | —                                                                                       | T0 红牌                                           |
| `bankAccountNumberFull / Last4`                      |     **绝对 N**      | —                                                                                       | 金融账户 PII                                      |
| `requestedLoanAmountMinor / currency`                | N（可反推收入范围） | 仅 ZK proof 中「loan <= limit」「amount > 0」等 range constraint 的 public input        | 证明「借款人贷款金额 <= 月薪 3 倍」不披露具体数值 |
| `repaymentTimeliness`（连续 N 期按时还款 = true）    |      有条件 Y       | ZK-Semaphore 类型匿名 VC：证明 持有地址完成 3 期按时，但不披露具体期数 / 金额 / Lender  | 场景 C：跨 Lender 利率折扣证明；不与具体人挂钩    |
| `lenderCode`（LENDER-A/B/C）                         |          N          | `H(lenderCode                                                                           |                                                   | nonce)` 映射                       | 跨 Lender 互认但不暴露具体 Lender ID     |
| `employerTaxId`                                      |          N          | `H(taxId                                                                                |                                                   | nonce)` 仅 Employer 域内部自己验证 | Employer 校验其员工 VC，但不对外暴露税号 |
| `disbursementTxHash`（稳定币放款链上 Hash）          |    Y（必要字段）    | 公开可见，但仅存 hash，不含 PII                                                         | 对账与审计留痕                                    |
| `reconciliationMerkleRoot`（每日对账行的 Merkle 根） |    Y（必要字段）    | 由 Finance 域离线构建所有行的 merkle tree → root 上链；每单 leaf 可证明包含但不泄露内容 | 审计留痕；Lender 可离线 verify 某笔对账是否包含   |

### 3.1 链上凭证安全 5 条硬约束（S2 启用前必须工程化）

1. **Hash nonce 轮换**：所有 `nonce_web3_secret` 每 90 天 KMS 轮换；旧 nonce 保留 2 年仅用于审计查询。
2. **ZK proof 验证失败即告警**：任何 24h 内 VC 验证失败 >5 次 → DPI_EXPORT_DENIED 事件 + Ops 紧急阻断该链。
3. **所有链上写入经过**：内部 3 层（业务 API → Proof Service → RPC Gateway → Chain）；任何直接 RPC = 拒绝。
4. **链上数据 GDPR 擦除难题**：PayEase 无法承诺链上数据物理删除（链不可变），因此 VC 只发布「有效期 1 年」版本；到期自动失效；法务在用户协议中明确告知用户「链上哈希无法删除，用户接受此风险」。
5. **审计节点白名单**：链上 full node 仅审计机构 + NBC 监管 + PayEase 内部审计 3 类 IP 可同步；其他 public 节点拒绝连接（如用 permissioned chain 的话）。

---

## 4. 决策结论与推荐路径（给产品 Owner + 4 方签字的 Go / No-Go 表）

| 决策维度                                           |                                          Go / No-Go 建议（S1 阶段）                                           | 详细理由                                                                                                                                                |
| :------------------------------------------------- | :-----------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 整体 Web3 结算                                     |                                         **No-Go（S1 阶段默认不做）**                                          | 业务场景 A/B/C/D/E 全部未验证；NBC 稳定币书面合规未拿到；Web3 域账号边界未进 SECURITY_S0_2_CHECKLIST；任何一项失败都可能引发合规与声誉风险              |
| Web3 域账号 / KMS 写入 S0.2 签字包 PART 1 + PART 3 |                                    **有条件 Go（仅文档写入，不创建账号）**                                    | 在 SECURITY_S0_2_CHECKLIST 中**增加占位** 3 个 Web3 域账号 + 3 个 KMS Owner 代号，若未来 S2 评估 Go → 直接实例化占位；No-Go → 划掉占位即可              |
| 链上凭证（Verifiable Credential）沙箱              |                              **有条件 Go（仅 100% mock 模拟环境，不连真实链）**                               | 在 S2 沙箱中用 **Anvil / Hardhat / Ganache 本地私有链**（无真实公网连接）做 ZK proof + merkle root 的技术验证；仅验证技术可行性，不验证任何真实业务数据 |
| 稳定币结算 MVP（$1-$1000 金额）                    | **No-Go 直到 4 项满足**：① NBC 书面 ② Bakong 通道不可用 ③ Multi-Sig 9-Owner 到位 ④ 传统对账 6 个月 0 重大差异 | 风险过高（Critical 5 项），除非 4 项全满足                                                                                                              |
| 未来 S2 预算（如 Go）                              |           预估：独立基础设施 30% + 安全审计 30% + 法务/合规 25% + 业务开发 15%；至少 $300K 启动预算           | 审计 + HSM + OTC 深度协议 + NBC 沙箱申请费用昂贵                                                                                                        |

### 4.1 S2 Go / No-Go 最终 4 方签字（本页末占位，仅文档阶段）

| 签字方                    | Go / No-Go 选择（签名 + 日期）                   | 备注                                                     |
| :------------------------ | :----------------------------------------------- | :------------------------------------------------------- |
| 产品 Owner                | □ Go □ No-Go 签字：__________________ ____/**/** |                                                          |
| CISO / 安全 Owner         | □ Go □ No-Go 签字：__________________ ____/**/** | 必须满足 §1.3 + §2.1 7 风险 Critical 级都有 3 条缓解     |
| 法务                      | □ Go □ No-Go 签字：__________________ ____/**/** | 必须提供 NBC 书面同意复印件                              |
| DPO / 合规负责人          | □ Go □ No-Go 签字：__________________ ____/**/** | 必须确认 §3 5 条硬约束工程化可实现 + 用户告知清晰        |
| 持牌机构代表（Lender-A）  | □ Go □ No-Go 签字：__________________ ____/**/** | 签署「脱锚损失由 Lender 承担」补充协议                   |
| 基础设施 Owner（Web3 域） | □ Go □ No-Go 签字：__________________ ____/**/** | 确认 S0.2 PART 1 + PART 3 新增 3 账号 + 3 KMS Owner 到位 |

---

## 5. 参考（仅研究，不做任何推荐）

- Circle USDC 储备证明：https://www.circle.com/en/usdc#reserves
- Polygon PoS 链 gas & 稳定性报告（2025）
- 柬埔寨 NBC 2024 年加密资产监管框架（高棉语原文 + 英文翻译，DPO 归档）
- Bakong CBDC 商户接入 API 文档（NBC 官方）
- Gnosis Safe Multi-Sig 审计报告 v1.3（Zellic + OpenZeppelin 双审计）
- Semaphore / Polygon ID ZK VC 白皮书

> **本文档是研究用决策输入；任何提及的具体公链 / 稳定币 / SDK 不构成投资 / 技术选型推荐。最终选型需 4 方签字并符合柬埔寨全部适用法规。**
