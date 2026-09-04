# Trae T06：KYC 允许借款区域与 Telegram 定位核验

## 1. 目标与边界

为 PayEase Mini App 增加一次性、用户主动授权的 Telegram 定位核验；由 KhmerX 助贷运营后台维护版本化的允许借款区域。服务端是唯一的区域判定权威。

本任务只覆盖 KhmerX 助贷域，不连接持牌机构域，不接 Google Maps、Google Geocoding 或任何外部征信接口。

### 不可违反的规则

1. Mini App 只能提交 Telegram 原生授权的一次定位快照，不能提交“我在允许区域”的结论。
2. 禁止页面加载时自动请求定位，禁止后台持续定位、`watchPosition` 或周期性采集。
3. 精确经纬度、精度和定位时间是 KYC 复核证据：加密保存，普通助贷人员、企业 HR/财务、客服、用户端均不得读取原始坐标。
4. 命中区域是 KYC 风险信号，不是前端自动拒绝依据。`OUT_OF_ZONE`、`OUT_OF_COUNTRY`、`LOW_ACCURACY`、`UNAVAILABLE` 都进入人工复核或补件。
5. 已启用区域不可更新或删除；任何边界变动必须创建新版本，经复核后启用。
6. 不把 Google API Key、地图服务密钥或完整定位 URL 放入仓库、浏览器日志、审计 payload 或错误消息。
7. 地理围栏判定必须在 Broker 服务端执行，不能只在浏览器执行。

## 2. 用户流程

```text
用户进入 KYC 身份核验步骤
  → 阅读“定位仅用于本次 KYC 人工复核”的说明
  → 点击【授权当前位置】
  → Telegram LocationManager 原生授权
  → Mini App 显示一次“确认提交定位核验”
  → POST Broker API（坐标、精度、采集时间、授权版本）
  → Broker 加密保存定位证据，匹配已启用区域版本
  → Mini App 仅显示：已提交 / 允许区域内 / 需人工复核
  → 申请提交后，审核员在受控 KYC 证据视图查看判定结论与必要证据
```

用户端三语文案应避免“拒绝”“风控规则”“GPS 追踪”。中文基线：

> 授权当前位置（可选）\n定位仅用于本次身份与服务区域核验，不会持续追踪。若无法获取定位，工作人员可能联系您补充资料。

## 3. 区域管理流程

```text
OPS_ADMIN 创建区域草稿
  → 填写名称、适用范围、有效期、变更原因
  → 在地图绘制单个闭合 Polygon
  → 提交复核
  → 另一名 OPS_ADMIN 复核边界与适用工厂
  → 启用版本
  → 旧版本到期或手动停用（不删除）
```

### 3.1 区域字段

| 字段                                       | 说明                                              |
| ------------------------------------------ | ------------------------------------------------- |
| `zoneRef`                                  | 不可变外部引用，如 `ZONE-PPH-001`                 |
| `version`                                  | 单调递增整数；每次边界或适用范围变动加一          |
| `displayName`                              | 管理端名称，如“金边服务区”                        |
| `scopeType`                                | `PLATFORM` 或 `EMPLOYER_TENANT`                   |
| `employerTenantId`                         | `EMPLOYER_TENANT` 时必填                          |
| `polygonGeoJson`                           | 单一闭合 GeoJSON Polygon；仅服务端保存与判定      |
| `status`                                   | `DRAFT` / `PENDING_REVIEW` / `ACTIVE` / `RETIRED` |
| `effectiveFrom` / `effectiveUntil`         | 启用有效期；结束时间可为空                        |
| `changeReason`                             | 创建或变更原因，最长 500 字符                     |
| `createdBy` / `reviewedBy` / `activatedBy` | 管理员账号引用                                    |

### 3.2 状态与权限

| 操作          | 权限                       | 前置条件                                          |
| ------------- | -------------------------- | ------------------------------------------------- |
| 创建/编辑草稿 | `OPS_ADMIN`                | 只能改 `DRAFT`                                    |
| 提交复核      | `OPS_ADMIN`                | Polygon 合法、至少 3 个不同点、闭合               |
| 复核          | 不同于创建人的 `OPS_ADMIN` | 状态为 `PENDING_REVIEW`                           |
| 启用          | 不同于创建人的 `OPS_ADMIN` | 已复核；同一 scope 不能有重叠的有效 `ACTIVE` 版本 |
| 停用          | `OPS_ADMIN`                | 写原因；只改状态为 `RETIRED`                      |

## 4. 判定规则

1. 先校验纬度 `[-90, 90]`、经度 `[-180, 180]`、精度为正数，采集时间不得早于当前时间 10 分钟。
2. 精度阈值由服务端配置，V1 默认 `horizontalAccuracyMeters <= 200`；超过阈值返回 `LOW_ACCURACY`。
3. 先以柬埔寨国界 Polygon 判定。未命中返回 `OUT_OF_COUNTRY`。
4. 再按申请人选定的工厂匹配其有效区域；若该工厂没有专属区域，匹配全平台区域。
5. 命中任一有效 Polygon 返回 `MATCH`，并记录 `zoneRef` 与 `version`；未命中返回 `OUT_OF_ZONE`。
6. 边界点视为命中；服务端必须使用确定性的 point-in-polygon 实现，并覆盖边界测试。
7. 每次判定使用申请时刻有效的区域版本；以后区域变动不能改写已保存的历史结果。

可见投影：

| 判定             | 用户端文案                                       | 审核队列           |
| ---------------- | ------------------------------------------------ | ------------------ |
| `MATCH`          | 已提交服务区域核验                               | 通过，仍需人工 KYC |
| `OUT_OF_ZONE`    | 当前区域暂未开放，资料将进入人工复核             | 区域外复核         |
| `OUT_OF_COUNTRY` | 当前定位不在服务区域，请确认后重试或等待人工复核 | 异常复核           |
| `LOW_ACCURACY`   | 定位精度不足，请在信号较好的位置重试             | 补件/人工复核      |
| `UNAVAILABLE`    | 暂无法获取定位，可继续提交资料                   | 补件/人工复核      |

## 5. 数据与 API

### 5.1 追加式迁移

在 `broker-platform/db/migrations/` 追加新迁移，不修改历史迁移。

最少新增：

```text
service_area_zone_versions
kyc_location_evidence
kyc_location_assessments
```

`kyc_location_evidence` 至少保存：`user_id`、可选 `application_id`、加密的 `latitude/longitude/accuracy/capturedAt`、`consent_version`、`source = TELEGRAM_LOCATION_MANAGER`、创建时间、密钥版本。

`kyc_location_assessments` 为追加式事实：`evidence_id`、结论、命中的区域引用与版本、规则版本、判定时间、操作者 `SYSTEM`。禁止 `UPDATE` 与 `DELETE`。

不得把坐标、地址或 GeoJSON 写入 `audit_events.payload`；审计仅记录证据引用、结论、规则版本、区域版本和 actor。

### 5.2 管理端 API

所有端点需要 Broker 管理会话、CSRF 和 `OPS_ADMIN`。

```text
GET    /v1/local/admin/service-area-zones
POST   /v1/local/admin/service-area-zones
PATCH  /v1/local/admin/service-area-zones/:zoneRef/drafts/:version
POST   /v1/local/admin/service-area-zones/:zoneRef/drafts/:version/submit-review
POST   /v1/local/admin/service-area-zones/:zoneRef/versions/:version/review
POST   /v1/local/admin/service-area-zones/:zoneRef/versions/:version/activate
POST   /v1/local/admin/service-area-zones/:zoneRef/versions/:version/retire
```

写操作必须有 `Idempotency-Key`；响应不返回其他区域的原始 GeoJSON 给无权限角色。

### 5.3 Mini App API

```text
POST /v1/local/public/kyc-location-evidence
GET  /v1/local/public/kyc-location-evidence/status
```

`POST` 仅接受：

```json
{
  "latitude": 11.5564,
  "longitude": 104.9282,
  "horizontalAccuracyMeters": 80,
  "capturedAt": "2026-09-01T10:00:00.000Z",
  "consentVersion": "KYC_LOCATION_V1"
}
```

要求 Telegram 已验签申请会话和 CSRF。禁止接受：自定义地址、区域结论、连续定位轨迹、第三方地图 URL、客户端传来的 `zoneRef` 或 `assessment`。

## 6. 前端实现要求

1. 使用 `Telegram.WebApp.LocationManager`；先 `init`，仅在用户点击后 `getLocation`。
2. Telegram 环境不支持时展示 `UNAVAILABLE`，不可偷偷退回浏览器 `navigator.geolocation`。
3. 只上传用户二次确认后的单次结果；提交期间禁用重复点击。
4. Mini App 个人中心仅展示定位状态与最近一次提交时间，不展示坐标、地址、区域边界。
5. 管理端使用 MapLibre + 绘制插件；地图瓦片服务通过部署配置注入，不提交 token。开发环境可用 mock 底图；生产不得依赖 OpenStreetMap 公共瓦片服务。
6. 管理端只给 `OPS_ADMIN` 加载地图和编辑工具；企业端、持牌机构端、客服端均不得加入该页面。

## 7. 验收测试

### Broker 单元与集成测试

- Polygon 点内、点外、边界点、非法 Polygon、坐标越界与精度超限。
- 仅 `OPS_ADMIN` 可管理区域；创建人与复核人不能是同一账号。
- 启用后不能 PATCH 边界；启用新版本不改历史 KYC 判定。
- 指定工厂优先于全平台区域；其他工厂不能读取或使用该专属区域。
- 未登录、缺 CSRF、伪造 `zoneRef`、重复请求、过期定位全部拒绝。
- 原始坐标可从加密字段解密供授权测试验证，但 API、审计 payload、日志和管理列表均不出现。
- `kyc_location_assessments` 的 `UPDATE/DELETE` 被数据库 trigger 拒绝。

### Mini App 测试

- 未点授权不调用定位 API。
- Telegram LocationManager 拒绝、不可用、低精度、成功的 UI 状态。
- 成功时只上传允许字段；不写入 `localStorage` / `sessionStorage`。
- 中文、英语、高棉语文案存在且不含“自动拒绝”“持续跟踪”。

### 必跑命令

```powershell
pnpm --filter @payease/broker-api typecheck
pnpm --filter @payease/broker-api test
pnpm --filter @payease/user-mini-app typecheck
pnpm --filter @payease/user-mini-app test
pnpm format:check
```

真实 PostgreSQL 环境可用时，额外运行 Broker 迁移运行时集成测试；静态测试不能替代 append-only trigger、加密字段和权限隔离的真实数据库验证。

## 8. 明确不做

- 不接 Google API 或地理编码服务。
- 不提供实时追踪、轨迹、围栏通知或后台定位。
- 不把“区域外”直接映射为拒贷。
- 不让企业 HR/财务、客服或持牌机构后台读取精确位置。
- 不提交地图瓦片、Bot、数据库或任何第三方服务密钥。
