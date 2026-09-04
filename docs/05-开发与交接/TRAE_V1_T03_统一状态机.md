# Trae V1 T03：两域统一状态机与事件投影

**任务类型**：领域纯函数、事件、状态投影与测试。**原则**：没有共享 `application.status`；Broker 与 Lender 各有权威状态，用户只见受控投影。V1 已废止“工资代扣 / 三种回收方式”旧模型，还款统一为用户主动发起银行或支付机构授权。

## Broker 申请状态

`DRAFT → KYC_IN_PROGRESS → KYC_SUBMITTED → BROKER_REVIEWING → EMPLOYER_VERIFYING → LENDER_PACKAGE_SENT → LENDER_DECISION_PROJECTED → CONTRACT_EVIDENCE_COLLECTING → LENDER_CONTRACT_ACCEPTED_PROJECTED → DISBURSEMENT_PROJECTED → CLOSED`

分支：

- 任意审核阶段可进入 `MORE_INFO_REQUIRED`，补件后回到发起方审核阶段。
- 持牌拒绝投影为 `REJECTED`；只能新建申请，不得修改原申请复活。
- `CLOSED` 只属于本域关闭投影，不是两域共享状态。

## Lender 案件与资金状态

```text
CASE_RECEIVED
→ LENDER_REVIEWING
→ OFFER_READY
→ FINAL_CONTRACT_READY
→ CONTRACT_EVIDENCE_RECEIVED
→ CONTRACT_EVIDENCE_ACCEPTED
→ DISBURSEMENT_APPROVAL_PENDING
→ DISBURSEMENT_PROCESSING
→ WALLET_CREDIT_PENDING
→ WALLET_AVAILABLE
→ WITHDRAWAL_AVAILABLE / WITHDRAWAL_PROCESSING
→ REPAYMENT_DUE
→ REPAYMENT_INTENT_CREATED
→ REPAYMENT_AUTHORIZING
→ REPAYMENT_PROCESSING
→ PAID_OFF
```

异常分支：`MORE_INFO_REQUIRED`、`REJECTED`、`DISBURSEMENT_EXCEPTION`、`WITHDRAWAL_SUCCEEDED`、`WITHDRAWAL_FAILED`、`WITHDRAWAL_EXCEPTION`、`REPAYMENT_FAILED`、`REPAYMENT_EXCEPTION`、`OVERDUE`。

## 关键不变量

1. `CONTRACT_EVIDENCE_ACCEPTED` 前不得进入放款审批。
2. `WALLET_AVAILABLE` 仅由持牌/支付通道验签的放款成功事件进入。
3. 提现先冻结余额；失败、取消或超时不得错误扣减可用余额。
4. `REPAYMENT_INTENT_CREATED`、`REPAYMENT_AUTHORIZING` 与 `REPAYMENT_PROCESSING` 均属于持牌机构域的还款授权链路；Broker 只接收投影结果。
5. 还款成功仅由持牌域验签回调/核销事件进入；前端返回页不得改变账务。
6. 非法迁移返回 `409 INVALID_STATE_TRANSITION` 并追加审计事件。

## 跨域事件

| 事件                            | 发送方 | 接收方 | 结果                     |
| ------------------------------- | ------ | ------ | ------------------------ |
| `APPLICATION_PACKAGE_SUBMITTED` | Broker | Lender | 创建/关联案件            |
| `LENDER_MORE_INFO_REQUIRED`     | Lender | Broker | 产生补件投影             |
| `LENDER_DECISION_AVAILABLE`     | Lender | Broker | 展示额度或拒绝结果       |
| `CONTRACT_EVIDENCE_SUBMITTED`   | Broker | Lender | 持牌侧先记录 receipt     |
| `CONTRACT_EVIDENCE_ACCEPTED`    | Lender | Broker | 展示合同已确认           |
| `DISBURSEMENT_CONFIRMED`        | Lender | Broker | 展示放款与钱包到账       |
| `WITHDRAWAL_STATUS_CHANGED`     | Lender | Broker | 展示提现处理中/成功/失败 |
| `REPAYMENT_STATUS_CHANGED`      | Lender | Broker | 展示账单状态             |

## T03 验收

- 各域状态机纯函数、所有非法迁移、重复事件、乱序事件均有测试。
- 事件使用 Outbox/Inbox、签名、nonce、时钟窗口、幂等键和死信处理。
- 不存在跨域数据库查询、共享数据库主键或共同可写状态字段。
