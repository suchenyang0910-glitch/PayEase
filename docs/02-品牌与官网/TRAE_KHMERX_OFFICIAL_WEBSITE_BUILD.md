# Trae 编码任务：KhmerX 官网

## 0. 目标

在新建 `khmerx-website/` 中交付 KhmerX 三语官方网站。它是公开、静态优先、SEO/GEO 友好的品牌与合作入口；它不是 PayEase Mini App、后台或贷款申请系统。

**必须先读：**

1. `KHMERX_PLATFORM_PHILOSOPHY.md`
2. `KHMERX_OFFICIAL_WEBSITE_SEO_GEO_PLAN.md`
3. `KHMERX_WEBSITE_MEDIA_DIRECTION.md`
4. `KHMERX_WEBSITE_FILE_ARCHITECTURE.md`
5. `TRAE_KHMERX_WEBSITE_COPY_I18N.md`
6. `KhmerX_Official_Website_UI_Reference.png`
7. `KhmerX_Website_Product_Interaction_Flow.png`

## 1. 允许改动范围

```text
khmerx-website/**
pnpm-workspace.yaml                    # 仅增加 khmerx-website
package.json / pnpm-lock.yaml          # 官网依赖需要时的最小修改
.github/workflows/**                   # 仅在已有质量门禁确实未覆盖官网时，追加最小 paths / job
```

禁止改动：

```text
broker-api/**
user-mini-app/**
broker-platform/**
lender-core/**
hr-verify-portal/**
finance-verify-portal/**
packages/shared-money/src/**
packages/shared-security/src/**
```

除非 Codex 后续拆分专门任务。不得以官网开发为由重构业务端。

## 2. 页面交付

第一批必须完成三语版本：

```text
/km/, /en/, /zh-cn/
/[locale]/platform
/[locale]/payease
/[locale]/how-it-works
/[locale]/for-enterprises
/[locale]/for-financial-partners
/[locale]/security-and-governance
/[locale]/fees-and-disclosure
/[locale]/help
/[locale]/about
/[locale]/contact
/[locale]/legal/privacy
/[locale]/legal/terms
/[locale]/legal/complaints
/[locale]/legal/cookies
```

资源中心可先实现列表与一篇三语示例文章，但必须先完成 Content Collection、schema、SEO / GEO 元数据与 noindex 规则。

## 3. 视觉与媒体

- 使用 KhmerX Logo，PayEase 显示为 `PayEase · by KhmerX`。
- 参考官网 UI 图实现：白色、深海军蓝、KhmerX 蓝、冰蓝灰、克制几何纹理、大量留白。
- 每页一个独立情绪视觉；默认静态 WebP / AVIF。
- 首页视频完全可选：无声、无自动音频、`preload="none"`、仅桌面快速网络延迟加载；移动端和减少动画偏好仅显示海报。
- 不下载或提交未经许可确认的网络素材；先使用受控占位海报 / 本地抽象 CSS 背景，并建立素材台账。

## 4. 文案和业务红线

- KhmerX 是协作平台；PayEase 是个人产品；最终金融决定由接入的持牌金融机构独立完成。
- 不使用：保证获批、秒到账、即时放款、最低利率、零门槛、零风险。
- 不暗示政府 / 监管机构背书；不虚构合作机构、企业客户、用户评价或业务数据。
- 个人申请入口仅跳转到获批准的 PayEase Telegram 路径 / 说明页；官网不采集 KYC、证件、银行卡、合同、订单或还款凭证。
- 所有高棉语金融文案标记为待母语 / 合规审校后才可 `published`。

## 5. SEO / GEO 交付要求

- 所有已发布页面有 SSG HTML、唯一 title / description / H1、canonical、hreflang、OG、可解析 JSON-LD。
- `robots.txt` + `sitemap.xml` + `llms.txt`；登录、预览、提交结果、后台、个人数据路由 noindex。
- 资源和 FAQ 由校验过的内容集合驱动；展示发布时间、更新时间、作者角色与审核角色。
- 将“KhmerX 是什么”“PayEase 如何协作”“企业核验什么”“谁决定额度与合同”“用户何时看到费用”等写成正文中可直接引用的问答。

## 6. Trae 的分段交付

### Task W0：可运行骨架

- 交付 workspace、Astro 配置、三语路由、BaseLayout、Header / Footer、tokens、robots / sitemap 初版。
- 附 typecheck、build 与 SEO 静态断言输出。

### Task W1：首页与视觉系统

- 交付首页、平台页、三类受众入口、协作流程、信任卡、路线图、响应式导航。
- 确保 JavaScript 被禁用时仍能阅读关键信息和导航。

### Task W2：受众、产品与治理页

- 交付 PayEase、企业、机构、流程、安全、费用、帮助页面。
- 所有 CTA 真实指向预定路由或受控说明；没有假表单成功状态。

### Task W3：内容 / GEO / 法律页

- 交付资源集合、FAQ、About、Contact、法律页、Schema 与三语元数据。
- 对应测试覆盖缺失翻译、重复 canonical、错误 hreflang、noindex 泄漏。

### Task W4：表单与性能

- 企业 / 机构咨询表单仅允许最少联系信息；无附件上传。
- 媒体懒加载、减少动态效果、键盘可用性、静态海报策略。

## 7. 交付纪律

每个 Task 完成后，Trae 仅提交以下信息给 Codex，**不执行 commit / push / 部署**：

```text
1. 本次目标与实际改动文件
2. 新增依赖及理由
3. 三语 / SEO / GEO / 安全边界影响
4. 新增或修改的自动化测试
5. 验证命令与完整退出码
6. git diff --stat
7. 未完成项、风险与需要产品确认项
```

Codex 完成审查、门禁、提交、远程 CI 和部署安排。
