# Trae 编码任务：KhmerX × PayEase 用户端视觉与品牌升级

## 0. 任务边界

本任务只改 `user-mini-app` 的前端视觉、品牌资源接入和展示文案；不改后端接口、数据库、Telegram 验签、会话 Cookie、合同、授信、放款或支付逻辑。

不得覆盖当前工作区中已有的未提交 UI 改动；先检查差异，再以最小修改方式合并本需求。

## 1. 品牌层级（必须遵守）

```text
KhmerX                 集团 / 平台主品牌
└─ PayEase             KhmerX 面向个人的金融产品（To-P）
   └─ PayEase by KhmerX 个人用户端展示名称
```

用户端不得将 PayEase 作为集团主品牌。页面首屏必须能看出：`KhmerX` 是平台，`PayEase` 是其个人金融产品。

## 2. Logo 资源

- 用户提供的原始文件：`D:\projects\khmerx\logo.jpg`
- 导入目标：`user-mini-app/src/assets/khmerx-logo.jpg`
- 不要直接引用 `D:` 盘绝对路径；必须将资源复制进项目并从模块导入。
- 保留 Logo 图形、`KhmerX` 名称和深蓝/亮蓝配色；首页 Header 只展示裁切后的 Logo 图形或图形 + `KhmerX` 文字，不展示图片底部的 `BUY · SELL · TRADE` 标语。
- 资源为白底 JPG。如直接缩放后白底明显，允许在不改变 Logo 图案的前提下使用 CSS `object-fit: contain`、白色容器和适度裁切；不要用滤镜改变标识颜色。

推荐 Header 标识：

```text
[KhmerX logo] KhmerX
PayEase · by KhmerX
```

窄屏时可改为同一行 `KhmerX | PayEase`，但 KhmerX 必须优先于 PayEase。

## 3. 产品规则与合规文案

### 3.1 V1 产品期限（替换旧规则）

- 可选期限仅：`15 天`、`30 天`。
- 不得再显示 `7–180 days`、`1m`、`3m`、`6m` 或任何未确认期限。
- 首页可显示：`USD 10–500 · 15 / 30 days`；实际金额、费用、条款以持牌机构审核结果为准。

### 3.2 禁止文案

不得出现下列或等价承诺：

- 低利率 / 最低利率
- 极速到账 / 秒到账 / 5 分钟到账
- 保证获批 / 无条件 / 零门槛
- 由 KhmerX 或 PayEase 自行授信、定价、放款的表述

### 3.3 必须保留的合规表达

中文基准：`额度、费用与合同条款由持牌金融机构独立审核并在确认前展示。请理性借贷，按时还款。`

英语基准：`Amount, fees and contract terms are independently reviewed by a licensed financial institution and shown before confirmation. Borrow responsibly.`

高棉语须由母语审核；在未提供经审核译文前，沿用现有 i18n 文案结构，不能擅自用机器翻译覆盖生产文案。

## 4. 首页视觉规格

目标：轻量、干净、可靠、低干扰的移动金融界面。参考尺寸 `375 × 667`，同时必须自适应 Android / iOS / Telegram WebView。

### 4.1 设计 Tokens

| Token             |        值 | 用途             |
| ----------------- | --------: | ---------------- |
| `--kx-primary`    | `#4096FF` | 主按钮、选中状态 |
| `--kx-card-start` | `#57A8FF` | 额度卡渐变起点   |
| `--kx-card-end`   | `#4096FF` | 额度卡渐变终点   |
| `--kx-bg`         | `#F5F7FA` | 页面背景         |
| `--kx-text`       | `#1D2129` | 标题、金额       |
| `--kx-muted`      | `#86909C` | 辅助文字         |
| `--kx-divider`    | `#EEEEEE` | 分割线           |
| `--kx-surface`    | `#FFFFFF` | 卡片与导航       |

- 大卡片圆角 `16px`；按钮 `12px`；小组件 `8px`。
- 阴影：`0 4px 12px rgba(0,0,0,.06)`。
- 页面左右内边距 `16px`；模块间距 `20px`。
- 数字金额 `32px / 700`；一级标题 `18px / 700`；正文 `16px`；辅助 `14px`；合规 `11px`。
- 现有深色模式不得被删除；为新 Token 增加对应暗色值，保证对比度可读。

### 4.2 页面结构（从上至下）

1. **顶部导航（44px）**
   - 左：KhmerX Logo + `PayEase · by KhmerX` 产品副标。
   - 右：消息、客服两个线性图标；无营销红点、横幅、广告。
2. **可借额度主卡**
   - 唯一主视觉；浅蓝至蓝色渐变、16px 圆角、柔和阴影。
   - 内容：`我的可借额度` / `$0.00 USD` / 合规说明 / 主按钮 `开始申请` / `借款有风险，请理性借贷`。
   - 未登录或尚未授信时保留 `$0.00`，不能虚构已获额度。
3. **四宫格快捷入口**
   - `我要借款`、`还款管理`、`借款记录`、`额度提升`。
   - 只用简洁线性图标 + 文本；点击导航至现有 Tab 或现有功能，不制造无效页面。
4. **单张产品卡**
   - 标题：`PayEase 薪资贷申请`。
   - 信息：`USD 10–500 · 15 / 30 days`。
   - 唯一 CTA：`立即申请`。
   - 底部合规说明：额度、费用与条款以持牌机构审核结果为准。
5. **帮助入口**
   - 仅：`借款指南`、`安全防骗`。
   - 可跳已有帮助/客服区域；无假链接。
6. **固定合规区**
   - 小号、居中、可读：服务由持牌金融机构提供；请勿过度借贷，按时还款。
7. **底部 Tab**
   - `首页`、`借款`、`账单`、`我的`。
   - 当前页蓝色；其余灰色。保留安全区 `env(safe-area-inset-bottom)`。

## 5. 交互与可访问性

- 主按钮和申请按钮：按下缩放至 `0.96`，过渡不超过 `150ms`。
- 快捷入口：点击时只给低对比度底色反馈；禁用悬浮动效、轮播、弹跳、自动播放。
- 不用颜色作为唯一状态提示；图标须有可访问名称。
- 最小可点击区域 `44 × 44px`。
- 不得用 `localStorage` / `sessionStorage` 保存 token、Telegram initData、手机号、证件信息或合同信息。
- 当前用户语言偏好必须延续既有后端保存逻辑；不能为视觉任务降级为仅本地存储。

## 6. 推荐文件范围

优先检查并最小修改：

```text
user-mini-app/src/App.tsx
user-mini-app/src/pages/HomePage.tsx
user-mini-app/src/app.css
user-mini-app/src/assets/khmerx-logo.jpg       # 新增
user-mini-app/src/**/__tests__/*               # 仅补必要断言
```

不可修改：

```text
broker-api/**
infra/**
.github/workflows/s0-gate-shared.yml
packages/shared-money/src/**
packages/shared-security/src/**
```

## 7. 验收清单

- [ ] Header 展示用户提供的 KhmerX Logo，PayEase 明确标注为 `by KhmerX`。
- [ ] 页面仅显示 15 / 30 天，不再出现 7–180 天或旧期限快捷项。
- [ ] 金额字段继续用字符串最小单位模型；UI 仅负责格式化显示，禁止引入金额 `number` DTO。
- [ ] 无“低利率、极速到账、保证获批”等承诺。
- [ ] 机构独立审核与理性借贷提示在首页可见。
- [ ] 四个快捷入口和四个底部 Tab 均可操作或指向真实现有入口。
- [ ] 中 / 英 / 高棉三语切换后不丢失已保存的语言偏好。
- [ ] 深色模式与窄屏 Telegram WebView 无横向溢出。
- [ ] `pnpm --filter @payease/user-mini-app run typecheck` 通过。
- [ ] `pnpm --filter @payease/user-mini-app run test` 通过。
- [ ] `pnpm format:check` 通过。

## 8. 提交要求

1. 先展示 `git diff --stat` 和实际改动文件列表。
2. 不得提交任何真实 Token、合同、身份证、手机号、截图中的用户数据或构建产物。
3. 先完成本地三项验证，再交给 Codex 进行代码审查、GitHub CI、合并与部署。
