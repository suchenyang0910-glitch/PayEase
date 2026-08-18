# KhmerX 官网代码文件架构

**推荐框架：** Astro 5 + TypeScript + 少量 React Islands。
**原因：** 官网的主内容必须以三语静态 HTML 输出，才能稳定实现 SEO、GEO、canonical、hreflang、JSON-LD、站点地图与快速首屏；纯 Vite React SPA 不应承担这一职责。
**部署形态：** 静态站点构建产物，部署到 `https://khmerx.org`；不与 PayEase Mini App 或后台共享运行时、Cookie、用户数据或管理 API。

## 1. Workspace 位置

```text
E:\PayEase
├─ khmerx-website/                         # 新增：集团官网（公开静态站）
├─ user-mini-app/                          # 现有：PayEase Telegram Mini App
├─ broker-platform/                        # 现有：KhmerX Operations
├─ lender-core/                            # 现有：KhmerX Partner
├─ hr-verify-portal/                       # 现有：KhmerX Enterprise HR
├─ finance-verify-portal/                  # 现有：受控财务演示 / 后续企业能力
├─ broker-api/                             # 现有：受控业务 API
└─ packages/                               # 共享领域与安全包
```

Trae 新增 `khmerx-website` 到 `pnpm-workspace.yaml`，不搬迁、不重构上述已有项目。

## 2. 完整目录结构

```text
khmerx-website/
├─ package.json
├─ astro.config.mjs
├─ tsconfig.json
├─ vite.config.ts                           # 仅需要 Vitest / 辅助测试时保留
├─ public/
│  ├─ favicon.svg
│  ├─ robots.txt                            # 构建时或静态生成
│  ├─ llms.txt                              # 补充说明，非 SEO 替代品
│  ├─ images/
│  │  ├─ brand/khmerx-mark.svg
│  │  ├─ hero/                              # 经许可、压缩的背景 / 海报
│  │  └─ og/                                # 三语 Open Graph 图片
│  └─ media/
│     └─ home-hero/                         # 仅首页可选、无声短视频和 poster
├─ src/
│  ├─ pages/
│  │  ├─ index.astro                        # 302 或静态语言选择，不作为主 SEO 页
│  │  ├─ 404.astro
│  │  ├─ [locale]/
│  │  │  ├─ index.astro                     # 首页
│  │  │  ├─ platform.astro
│  │  │  ├─ payease.astro
│  │  │  ├─ how-it-works.astro
│  │  │  ├─ for-enterprises.astro
│  │  │  ├─ for-financial-partners.astro
│  │  │  ├─ security-and-governance.astro
│  │  │  ├─ fees-and-disclosure.astro
│  │  │  ├─ help.astro
│  │  │  ├─ resources/
│  │  │  │  ├─ index.astro
│  │  │  │  └─ [...slug].astro
│  │  │  ├─ about.astro
│  │  │  ├─ contact.astro
│  │  │  └─ legal/
│  │  │     ├─ privacy.astro
│  │  │     ├─ terms.astro
│  │  │     ├─ complaints.astro
│  │  │     └─ cookies.astro
│  │  ├─ sitemap-index.xml.ts
│  │  └─ og/[locale]/[page].png.ts          # 可选：动态 OG 生成
│  ├─ layouts/
│  │  ├─ BaseLayout.astro                   # <html lang>、head、SEO、header/footer
│  │  └─ LegalLayout.astro
│  ├─ components/
│  │  ├─ brand/
│  │  │  ├─ KhmerXLogo.astro
│  │  │  └─ BrandLockup.astro
│  │  ├─ navigation/
│  │  │  ├─ Header.astro
│  │  │  ├─ Footer.astro
│  │  │  ├─ LanguageSwitcher.tsx             # React island
│  │  │  └─ MobileMenu.tsx                   # React island
│  │  ├─ sections/
│  │  │  ├─ Hero.astro
│  │  │  ├─ AudienceCards.astro
│  │  │  ├─ CollaborationFlow.astro
│  │  │  ├─ TrustPrinciples.astro
│  │  │  ├─ RoadmapStrip.astro
│  │  │  ├─ CTASection.astro
│  │  │  └─ ResourceCards.astro
│  │  ├─ media/
│  │  │  ├─ ResponsiveImage.astro
│  │  │  └─ OptionalHeroVideo.tsx            # 仅首页；按网络 / 减少动效延迟加载
│  │  ├─ seo/
│  │  │  ├─ SeoHead.astro
│  │  │  ├─ HreflangLinks.astro
│  │  │  ├─ JsonLd.astro
│  │  │  └─ Breadcrumbs.astro
│  │  ├─ forms/
│  │  │  ├─ EnterpriseInquiryForm.tsx
│  │  │  └─ PartnerInquiryForm.tsx
│  │  └─ help/
│  │     ├─ FAQ.astro
│  │     └─ FAQFilter.tsx
│  ├─ content/
│  │  ├─ config.ts                           # Astro Content Collections + Zod schema
│  │  ├─ resources/
│  │  │  ├─ en/*.mdx
│  │  │  ├─ km/*.mdx
│  │  │  └─ zh-CN/*.mdx
│  │  ├─ faq/
│  │  │  ├─ en/*.yaml
│  │  │  ├─ km/*.yaml
│  │  │  └─ zh-CN/*.yaml
│  │  └─ legal/
│  │     ├─ en/*.mdx
│  │     ├─ km/*.mdx
│  │     └─ zh-CN/*.mdx
│  ├─ i18n/
│  │  ├─ config.ts                           # km / en / zh-CN 与默认 km
│  │  ├─ routes.ts                           # 本地化路径映射
│  │  ├─ dictionaries/
│  │  │  ├─ en.ts
│  │  │  ├─ km.ts
│  │  │  └─ zh-CN.ts
│  │  └─ translate.ts
│  ├─ lib/
│  │  ├─ seo.ts                              # title、canonical、description 生成
│  │  ├─ schema.ts                           # Organization / Service / FAQ / Article
│  │  ├─ urls.ts                             # 强制 https://khmerx.org
│  │  ├─ content.ts                          # 读取并校验内容集合
│  │  ├─ media.ts                            # 媒体清单 / alt / license id
│  │  └─ forms.ts                            # 只做前端校验与受控提交
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ global.css
│  │  ├─ utilities.css
│  │  └─ print.css
│  └─ tests/
│     ├─ seo.test.ts
│     ├─ i18n.test.ts
│     ├─ content-schema.test.ts
│     ├─ no-sensitive-links.test.ts
│     └─ media-policy.test.ts
├─ scripts/
│  ├─ validate-seo.mjs
│  ├─ validate-hreflang.mjs
│  ├─ validate-content.mjs
│  └─ check-media-manifest.mjs
└─ docs/
   └─ ASSET_REGISTER.md                      # 素材许可与审核台账
```

## 3. 关键依赖与 package.json 目标

```json
{
  "name": "@payease/khmerx-website",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview",
    "typecheck": "astro check",
    "test": "vitest run",
    "test:seo": "node scripts/validate-seo.mjs && node scripts/validate-hreflang.mjs && node scripts/validate-content.mjs",
    "test:media": "node scripts/check-media-manifest.mjs"
  }
}
```

建议依赖：`astro`、`@astrojs/react`、`@astrojs/sitemap`、`react`、`react-dom`、`zod`、`vitest`。不要为了官网引入大型状态管理、CMS SDK、动画框架或第三方视频播放器。

## 4. 路由与三语规则

| 规则      | 实现要求                                                                 |
| --------- | ------------------------------------------------------------------------ |
| 默认语言  | 高棉语 `km`；公开主 URL 为 `/km/`                                        |
| 三语路由  | 所有公开页均有 `/km/`、`/en/`、`/zh-cn/` 对应页面                        |
| Canonical | 页面 canonical 指向自身语言 URL                                          |
| Hreflang  | 同页输出 `km`、`en`、`zh-CN`、`x-default` 四个 alternate link            |
| 语言切换  | 保持当前逻辑页，切换至对应语言路径；缺译文时不静默跳英语，应显示受控回退 |
| 公开索引  | 首页、平台、PayEase、企业、机构、安全、资源、关于、法律文档              |
| 禁止索引  | 预览、表单提交结果、错误页、任何后台、Telegram Mini App、KYC、合同、订单 |

## 5. SEO / GEO 必须落地的代码点

### BaseLayout

- `<html lang>`、`meta charset`、viewport、canonical、hreflang、title、description、Open Graph、Twitter cards。
- 每页只能有一个 H1；主内容必须 SSR / SSG 输出，不能等客户端请求后再出现。
- JSON-LD 由 `JsonLd.astro` 输出并随页面内容变化；不得塞入虚构评论、评分、价格或认证。

### Content Collections

每篇资源和 FAQ 都有 Zod 校验字段：

```ts
(locale,
  slug,
  title,
  description,
  publishedAt,
  updatedAt,
  authorRole,
  reviewedByRole,
  status,
  canonicalPath,
  keywords,
  heroImage,
  heroAlt,
  noIndex);
```

- `status !== "published"` 或 `noIndex === true` 的内容绝不进入 sitemap。
- 高棉语内容需 `reviewedByRole` 非空才允许 `published`。
- 动态产品费率、合作机构名称、牌照、政策结论不写进静态营销文案；改为指向版本化、经审核的公开披露页。

### Form 边界

- 企业 / 机构咨询表单只采集最少联系资料；用 Zod 校验、CSRF / rate-limit 方案、成功页 noindex。
- 表单不能收集个人贷款申请、证件、银行卡、合同或任何 KYC 文件；个人申请只通过 PayEase Mini App。
- 未接入正式后端前，表单可用受控 `mailto` / 工单入口，不能假装“已提交到 CRM”。

## 6. 静态优先媒体实现

遵循 `KHMERX_WEBSITE_MEDIA_DIRECTION.md`：

- 所有页面默认加载压缩 WebP / AVIF；首屏图片目标 <= 180 KB。
- `OptionalHeroVideo.tsx` 只用于首页：桌面 + 快速网络 + 未启用 `prefers-reduced-motion` 时，用户可见后再 `preload="none"` 加载无声循环。
- 移动端、低网络、减少动画偏好一律只显示 `poster.webp`。
- 每项素材有 `asset_id`、来源 URL、许可复核日期、哈希、alt、人物/商标检查；不得只把素材来源写进提交说明。

## 7. Trae 实施顺序

### W0 - 脚手架与门禁

1. 新增 workspace 包、Astro 配置、静态构建脚本、基础测试。
2. 实现 tokens、BaseLayout、Header、Footer、三语路由和 404。
3. 验证 `astro check`、build、sitemap、robots、私密路由 noindex。

### W1 - 首页与平台页

1. 按 `KhmerX_Official_Website_UI_Reference.png` 实现首页。
2. 实现受众入口、协作流程、信任原则、路线图、CTA。
3. 可选首页视频组件，但默认静态海报；不得阻塞 LCP。

### W2 - 受众与产品页

1. PayEase、企业、机构合作、流程、安全治理、费用披露页面。
2. 使用统一 `PageHero`、`AudienceCards`、`CollaborationFlow`、`FAQ`、`CTASection`。
3. 所有产品口径以 `KHMERX_PLATFORM_PHILOSOPHY.md` 为准。

### W3 - 资源、法律与 SEO/GEO

1. 内容集合、资源列表 / 详情、FAQ、About、Contact、Legal。
2. 实现 Article / FAQ / Organization / Service / Breadcrumb JSON-LD。
3. 自动 sitemap、robots、llms.txt、OG 图片与三语 hreflang 校验。

### W4 - 性能、安全与交付

1. 响应式、键盘导航、对比度、减少动态效果。
2. 图片压缩、无敏感链接、表单边界、CSP 兼容检查。
3. Lighthouse 移动端目标：Performance / Accessibility / Best Practices / SEO 均 >= 90；以实际部署测试为准。

## 8. 测试与验收

```powershell
pnpm --filter @payease/khmerx-website run typecheck
pnpm --filter @payease/khmerx-website run test
pnpm --filter @payease/khmerx-website run test:seo
pnpm --filter @payease/khmerx-website run test:media
pnpm --filter @payease/khmerx-website run build
pnpm format:check
```

最低自动化断言：

- [ ] 每个已发布页面含唯一 title、description、H1、canonical 与 hreflang。
- [ ] 三语路径、翻译映射、sitemap 只包含可公开索引页。
- [ ] JSON-LD 可解析且与正文事实一致。
- [ ] noindex 页面绝不含个人申请、订单、合同、后台或查询参数 URL。
- [ ] 页面不含“保证获批、即时放款、最低利率、KhmerX 是放款主体”等禁用文案。
- [ ] 移动端默认不下载背景视频；图片 / 视频符合素材台账。
- [ ] 咨询表单不能上传文件，不能采集 KYC / 金融敏感资料。
