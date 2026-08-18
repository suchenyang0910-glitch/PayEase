# KhmerX 官网高级科技感媒体方向

**目标：** 每个官网核心页面有一项独立、可识别的视觉内容；整体保持蓝色科技感、克制、可信与柬埔寨本地关联。
**最终媒体策略：** **静态优先，视频可选。** V1 默认加载压缩静态背景；只允许首页 Hero 在桌面、网络条件允许且用户未开启“减少动态效果”时加载一段无声短循环视频。
**原则：** 视频只作为背景氛围，不承载关键信息；所有关键信息必须是可选择、可翻译、可索引的 HTML 文本。
**素材来源：** 以下候选均来自 Pexels 页面。下载和上线前由运营逐项复核页面显示的许可、作者、是否含可识别人物 / 商标和最终文件版本，并登记到素材台账。

## 1. 每屏一项视觉内容

| 官网页面                              | 推荐素材                                                                                                                                     | 类型             | 页面用法                                              | 交互与性能要求                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `/` 首页                              | [Phnom Penh cityscape aerial](https://www.pexels.com/video/aerial-view-of-bustling-phnom-penh-cityscape-32927008/) + 导出海报                | **唯一可选视频** | Hero 右侧或全宽低透明背景；默认先显示海报             | 仅桌面 + 快速网络延迟加载；否则只显示 `poster.webp`         |
| `/platform` 平台页                    | 蓝色粒子视频的首帧 / 自制蓝色网格 WebP                                                                                                       | 静态背景         | 作为“数字协作”模块背景，不放在正文下方                | 只使用 WebP / AVIF，不加载视频                              |
| `/payease` 产品页                     | 蓝色线条视频的首帧 / 自制数据线条 WebP                                                                                                       | 静态背景         | 用作产品流程 Hero 的局部背景，保留大面积白色内容区    | 禁止“资金到账 / 额度上涨”暗示；不加载视频                   |
| `/for-enterprises` 企业合作页         | [High-tech automated manufacturing process](https://www.pexels.com/video/high-tech-automated-manufacturing-process-32386569/) 的经许可海报帧 | 静态背景         | 表达企业协作与流程效率，置于企业内容卡背景            | 不加载视频；该画面不代表柬埔寨或合作工厂                    |
| `/for-financial-partners` 机构合作页  | [Blue glass facade](https://www.pexels.com/photo/blue-glass-facade-of-modern-building-18193138/)                                             | 静态图片         | 右侧抽象背景，叠加 Partner 门户、审批、审计等界面卡片 | 裁切为宽幅 WebP/AVIF；不出现具体机构 Logo 或牌照暗示        |
| `/security-and-governance` 安全治理页 | [Abstract data-encryption video](https://www.pexels.com/video/data-encrypting-854322/) 的经许可海报帧                                        | 静态背景         | 只用于标题区的低透明背景                              | 不加载视频；不把图中代码 / 数字当作真实安全指标             |
| `/resources` 资源中心                 | [Modern blue glass reflection](https://www.pexels.com/photo/reflection-in-windows-19342144/)                                                 | 静态图片         | 资源中心 Hero / 卡片封面统一的蓝色几何纹理            | 文章封面保留有意义 alt 文本；不将纯装饰图编入文章结构化数据 |
| `/about` 关于页                       | [Phnom Penh riverside aerial](https://www.pexels.com/video/aerial-view-of-phnom-penh-riverside-cityscape-33870984/) 的经许可海报帧           | 静态背景         | 表达“立足柬埔寨、面向数字协作”的品牌氛围              | 不加载视频；不暗示政府或城市官方合作                        |

## 2. 视觉语言

```text
主色：KhmerX blue #4096FF、deep navy #102A43、白色、冰蓝灰
动效：慢、低对比、无声音、无闪烁、无自动弹跳
纹理：光线、玻璃、颗粒、几何网格、柬埔寨建筑线稿（抽象化）
避免：霓虹黑客代码、钞票、豪车、夸张财富、奔跑的进度条、虚假仪表盘
```

每个页面只保留一个“情绪视觉”，正文卡片使用白底 / 浅灰底；不要同时叠加视频、复杂渐变、粒子、玻璃模糊和多张照片。

### V1 加载预算

```text
首页：首屏静态海报 <= 180 KB；可选视频 <= 1.5 MB，延迟加载
其他页面：每页首屏图片 <= 180 KB；不请求背景视频
全站：不自动播放音频；不使用第三方 iframe 视频播放器
```

## 3. 实现规格（Trae）

### 视频组件

```text
<video muted playsInline loop preload="none" poster="...">
```

- 仅首页、桌面和网络条件允许时才加载视频；移动端及其他所有页面只展示海报。
- 监听 `prefers-reduced-motion: reduce`：不加载或不播放视频，只展示静态海报。
- 不用视频作为唯一信息渠道；标题、CTA、流程、合规边界全部为 HTML 文本。
- 首屏 hero 视频需使用 CDN、AV1/VP9 或 H.264 多格式、合理压缩；目标是短循环、低码率、无音轨。
- 图片输出 WebP / AVIF，保留原始授权文件的素材台账；响应式 `srcset` + 明确 `width/height` 防止 CLS。
- 所有素材使用本地托管 / 已批准 CDN，不将用户资料、订单、上传文件发送给第三方素材服务。

### 页面互动

| 页面    | 主互动                       | 视频 / 背景互动                                |
| ------- | ---------------------------- | ---------------------------------------------- |
| 首页    | 选择个人、企业、机构入口     | 视频只在 Hero 循环；滚动后淡出，不跟随鼠标     |
| 平台页  | 查看三方协作流程             | 背景维持极低对比，流程节点可点击展开 HTML 内容 |
| PayEase | 打开 Telegram / 查看申请流程 | 线条背景不影响报价、费用或合规文字阅读         |
| 企业页  | 提交企业合作咨询             | 制造业视频在 CTA 周围留静态色块保证可读性      |
| 机构页  | 提交机构合作咨询             | 图片背景旁的能力卡可展开审批、RBAC、审计说明   |
| 安全页  | 查看数据治理与隐私说明       | 不用“加密动画”替代真实控制项说明               |
| 资源页  | 搜索 / 筛选 FAQ、文章        | 静态封面，避免列表中多视频并发下载             |
| 关于页  | 查看 KhmerX 理念与联系入口   | 城市视频仅品牌叙事，不作为地理或合作证明       |

## 4. SEO / GEO 与无障碍要求

- 视频背景添加简短 `aria-label` / 邻接描述；纯装饰视频可 `aria-hidden="true"`。
- 海报图片 alt 描述真实画面，如“Phnom Penh aerial cityscape at dusk”，不能写关键词堆砌。
- 文章页使用文本事实、FAQ、结构化数据和更新时间建立可引用性；视频不能替代正文。
- `poster.webp`、首张响应式图片可预加载；其余图片 / 视频 `loading="lazy"` 或 IntersectionObserver 延迟加载。
- 不让视频文件出现在 XML sitemap；页面本身的可索引 HTML 才是 SEO 主体。
- 所有金融相关背景不得包含现金、未获授权的机构标志、用户证件、银行卡、可识别客户或误导性“获批”状态。

## 5. 素材上线台账字段

每个最终下载文件要登记：

```text
asset_id
page / component
source page URL
creator name (if shown)
source license checked date
download date
original file hash
derived WebP / video variants
people / logos / trademarks review
approved by
replacement review date
```

> Pexels 素材可用于商业网站的前提是遵守其许可限制。尤其不能暗示画面中人物、品牌或地点认可 KhmerX，也不能把素材本身作为商标或独立分发内容。
