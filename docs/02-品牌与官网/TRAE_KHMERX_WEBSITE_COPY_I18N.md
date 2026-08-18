# KhmerX 官网三语内容包

**用途：** Trae 将本文件内容拆入 `khmerx-website/src/i18n/dictionaries/` 与 `src/content/`。
**语言：** `km`（高棉语）、`en`（英语）、`zh-CN`（简体中文）。
**发布控制：** 中文 / 英语可作为产品工作文案；所有高棉语金融、费用、投诉、隐私和法律相关文案必须完成母语与合规审校后才可标记 `published`。

## 0. 文案与合规总则

- KhmerX 是数字商业与金融协作平台；PayEase 是面向个人的产品。
- 不写“保证获批、即时放款、最低利率、无条件、零门槛、零风险”。
- 不把 KhmerX 写成 V1 的持牌放款主体；最终金融决定和借款合同条款由接入的持牌金融机构独立审核并在确认前展示。
- 费用、利息、实际到账、应还金额与最终期限只在适用的审核 / 报价 / 合同流程中以版本化数据展示；官网只解释透明披露原则。
- 标记 `⚠ 法务审校` 的内容在获得柬埔寨当地法务批准前不得作为正式法律承诺发布。

## 1. 全站共享文案

### 1.1 导航

| Key                     | 高棉语 `km`               | English `en`           | 中文 `zh-CN` |
| ----------------------- | ------------------------- | ---------------------- | ------------ |
| `nav.platform`          | វេទិកា                    | Platform               | 平台         |
| `nav.payease`           | PayEase                   | PayEase                | PayEase      |
| `nav.enterprise`        | សម្រាប់សហគ្រាស            | For enterprises        | 企业合作     |
| `nav.partner`           | សម្រាប់ដៃគូហិរញ្ញវត្ថុ    | For financial partners | 机构合作     |
| `nav.security`          | សុវត្ថិភាព និងអភិបាលកិច្ច | Security & governance  | 安全与治理   |
| `nav.resources`         | មជ្ឈមណ្ឌលធនធាន            | Resources              | 资源中心     |
| `nav.about`             | អំពី KhmerX               | About KhmerX           | 关于 KhmerX  |
| `nav.language`          | ភាសា                      | Language               | 语言         |
| `cta.explorePayease`    | ស្វែងយល់អំពី PayEase      | Explore PayEase        | 了解 PayEase |
| `cta.enterpriseInquiry` | ពិគ្រោះកិច្ចសហការសហគ្រាស  | Enterprise enquiry     | 企业合作咨询 |
| `cta.partnerInquiry`    | ពិគ្រោះកិច្ចសហការដៃគូ     | Partner enquiry        | 机构合作咨询 |
| `cta.learnMore`         | ស្វែងយល់បន្ថែម            | Learn more             | 了解更多     |
| `cta.contactSupport`    | ទាក់ទងជំនួយ               | Contact support        | 联系客服     |

### 1.2 页脚

| 区块                | 高棉语 `km`                                                                                   | English `en`                                                                                                   | 中文 `zh-CN`                                          |
| ------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `footer.about`      | KhmerX គឺជាវេទិកាកិច្ចសហការឌីជីថល ដែលភ្ជាប់បុគ្គល សហគ្រាស និងស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណ។ | KhmerX is a digital collaboration platform connecting people, enterprises and licensed financial institutions. | KhmerX 是连接个人、企业与持牌金融机构的数字协作平台。 |
| `footer.company`    | ក្រុមហ៊ុន                                                                                     | Company                                                                                                        | 公司                                                  |
| `footer.support`    | ជំនួយ                                                                                         | Support                                                                                                        | 支持                                                  |
| `footer.legal`      | ច្បាប់ និងគោលការណ៍                                                                            | Legal                                                                                                          | 法律与政策                                            |
| `footer.privacy`    | គោលការណ៍ឯកជនភាព                                                                               | Privacy policy                                                                                                 | 隐私政策                                              |
| `footer.terms`      | លក្ខខណ្ឌប្រើប្រាស់                                                                            | Terms of use                                                                                                   | 使用条款                                              |
| `footer.complaints` | ការដាក់ពាក្យបណ្តឹង                                                                            | Complaints                                                                                                     | 投诉处理                                              |
| `footer.cookies`    | គោលការណ៍ខូគី                                                                                  | Cookie policy                                                                                                  | Cookie 政策                                           |
| `footer.rights`     | រក្សាសិទ្ធិគ្រប់យ៉ាង។                                                                         | All rights reserved.                                                                                           | 保留所有权利。                                        |

## 2. 首页 `/[locale]/`

### 2.1 Hero

| 字段          | 高棉语 `km`                                                                                           | English `en`                                                                                               | 中文 `zh-CN`                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| H1            | កិច្ចសហការឌីជីថលសម្រាប់កម្ពុជា                                                                        | Digital collaboration for Cambodia                                                                         | 面向柬埔寨的数字协作平台                                  |
| Body          | KhmerX ភ្ជាប់បុគ្គល សហគ្រាស និងស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណ តាមរយៈដំណើរការឌីជីថលដែលអាចទុកចិត្តបាន។ | KhmerX connects people, enterprises and licensed financial institutions through trusted digital workflows. | KhmerX 通过可信的数字化流程连接个人、企业与持牌金融机构。 |
| CTA primary   | ស្វែងយល់អំពី PayEase                                                                                  | Explore PayEase                                                                                            | 了解 PayEase                                              |
| CTA secondary | សម្រាប់សហគ្រាស                                                                                        | For enterprises                                                                                            | 企业合作                                                  |

### 2.2 三类入口

| 受众              | 高棉语 `km`                                                                                | English `en`                                                                                       | 中文 `zh-CN`                                          |
| ----------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Individuals title | សម្រាប់បុគ្គល                                                                              | For individuals                                                                                    | 个人用户                                              |
| Individuals body  | ស្វែងយល់ពី PayEase សម្រាប់ការដាក់ពាក្យ តាមដានដំណើរការ កិច្ចសន្យា និងការគាំទ្រការទូទាត់។    | Learn how PayEase supports application, progress tracking, agreements and repayment support.       | 了解 PayEase 如何支持申请、进度查询、协议与还款支持。 |
| Enterprises title | សម្រាប់សហគ្រាស                                                                             | For enterprises                                                                                    | 企业合作                                              |
| Enterprises body  | គាំទ្រការផ្ទៀងផ្ទាត់ព័ត៌មានបុគ្គលិកដោយមានការអនុញ្ញាត និងកិច្ចសហការដែលមានព្រំដែនច្បាស់លាស់។ | Support authorised employee verification through clearly bounded collaboration.                    | 通过边界清晰的协作支持经授权的员工信息核验。          |
| Partners title    | សម្រាប់ដៃគូហិរញ្ញវត្ថុ                                                                     | For financial partners                                                                             | 金融机构合作                                          |
| Partners body     | សហការជាមួយដំណើរការ អភិបាលកិច្ច និងសវនកម្ម ដែលរក្សាការសម្រេចចិត្តហិរញ្ញវត្ថុដោយឯករាជ្យ។     | Collaborate through governed, auditable workflows while retaining independent financial decisions. | 通过可治理、可审计的流程协作，同时保持独立金融决策。  |

### 2.3 协作流程与信任区

| 字段           | 高棉语 `km`                                                            | English `en`                                                         | 中文 `zh-CN`                         |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Section title  | របៀបដែល KhmerX ដំណើរការ                                                | How KhmerX works                                                     | KhmerX 如何协作                      |
| Step 1         | ដាក់ពាក្យ                                                              | Apply                                                                | 提交申请                             |
| Step 2         | ផ្ទៀងផ្ទាត់                                                            | Verify                                                               | 信息核验                             |
| Step 3         | ពិនិត្យ                                                                | Review                                                               | 独立审核                             |
| Step 4         | គាំទ្រ                                                                 | Support                                                              | 持续支持                             |
| Trust 1        | លក្ខខណ្ឌច្បាស់លាស់                                                     | Transparent terms                                                    | 条款透明                             |
| Trust 2        | ការការពារទិន្នន័យ                                                      | Data protection                                                      | 数据保护                             |
| Trust 3        | សិទ្ធិតាមតួនាទី                                                        | Role-based access                                                    | 按角色授权                           |
| Trust 4        | ស្នាមសវនកម្ម                                                           | Audit trail                                                          | 审计链路                             |
| Roadmap today  | ថ្ងៃនេះ៖ កិច្ចសហការស្នើសុំឥណទានប្រាក់ខែ PayEase                        | Today: PayEase salary-loan collaboration                             | 当前：PayEase 薪资贷协作             |
| Roadmap future | អនាគត៖ សេវាលំហូរសាច់ប្រាក់ផ្ទាល់ខ្លួន ការបង់រំលស់ និងកិច្ចសហការសហគ្រាស | Future: personal cash flow, instalments and enterprise collaboration | 未来：个人现金流、消费分期与企业协作 |

## 3. 平台页 `/[locale]/platform`

| 字段       | 高棉语 `km`                                                                                             | English `en`                                                                                                                | 中文 `zh-CN`                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| H1         | វេទិកាកិច្ចសហការសម្រាប់សេដ្ឋកិច្ចឌីជីថលកម្ពុជា                                                          | A collaboration platform for Cambodia's digital economy                                                                     | 服务柬埔寨数字经济的协作平台                                  |
| Intro      | KhmerX បង្កើតស្រទាប់ឌីជីថលរួម សម្រាប់អត្តសញ្ញាណ ការអនុញ្ញាត ពហុភាសា ការគ្រប់គ្រងសិទ្ធិ និងស្នាមសវនកម្ម។ | KhmerX provides shared digital foundations for identity, consent, multilingual experience, access control and auditability. | KhmerX 提供身份、授权、多语言、权限控制与审计等共用数字能力。 |
| Core title | KhmerX Core                                                                                             | KhmerX Core                                                                                                                 | KhmerX Core                                                   |
| Core body  | សមត្ថភាពរួមដែលអាចប្រើឡើងវិញបាន ដោយមិនបំបែកព្រំដែនទិន្នន័យ និងទំនួលខុសត្រូវរវាងភាគី។                     | Reusable capabilities designed without blurring data or responsibility boundaries between parties.                          | 在不模糊各方数据与责任边界的前提下提供可复用能力。            |
| CTA        | ស្វែងយល់ពីរបៀបធ្វើការ                                                                                   | See how it works                                                                                                            | 查看协作方式                                                  |

## 4. PayEase 页 `/[locale]/payease`

| 字段             | 高棉语 `km`                                                                                                                                          | English `en`                                                                                                                                           | 中文 `zh-CN`                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| H1               | PayEase ដោយ KhmerX                                                                                                                                   | PayEase by KhmerX                                                                                                                                      | PayEase · by KhmerX                                                                   |
| Intro            | PayEase គឺជាផលិតផលសម្រាប់បុគ្គលរបស់ KhmerX ដែលគាំទ្រការដាក់ពាក្យ តាមដានស្ថានភាព កិច្ចសន្យា វិក្កយបត្រ និងការគាំទ្រការទូទាត់។                         | PayEase is KhmerX's personal product for application, progress tracking, agreements, bills and repayment support.                                      | PayEase 是 KhmerX 面向个人的产品，支持申请、进度查询、协议、账单与还款支持。          |
| Process title    | ដំណើរការស្នើសុំឥណទានប្រាក់ខែ                                                                                                                         | Salary-loan application journey                                                                                                                        | 薪资贷申请流程                                                                        |
| Process body     | ចូលតាម Telegram → បំពេញព័ត៌មាន និងជ្រើសរើសសហគ្រាស → អនុញ្ញាត → ផ្ទៀងផ្ទាត់ → ការពិនិត្យឯករាជ្យ → ពិនិត្យលក្ខខណ្ឌ → កិច្ចសន្យា និងការគាំទ្របង់ប្រាក់។ | Telegram access → information and enterprise selection → consent → verification → independent review → offer review → agreement and repayment support. | Telegram 进入 → 信息与企业选择 → 授权 → 核验 → 独立审核 → 查看报价 → 合同与还款支持。 |
| Disclosure title | មុនពេលបញ្ជាក់                                                                                                                                        | Before confirmation                                                                                                                                    | 确认前透明展示                                                                        |
| Disclosure body  | ចំនួនទឹកប្រាក់ ថ្លៃសេវា ការប្រាក់ ចំនួនទទួលបានពិតប្រាកដ និងចំនួនត្រូវសង នឹងត្រូវបង្ហាញមុនពេលបញ្ជាក់តាមលទ្ធផលពិនិត្យ។                                 | Approved amount, fees, interest, amount received and repayment due are shown before confirmation, based on the review result.                          | 批准金额、费用、利息、实际到账与应还金额，将在确认前依据审核结果完整展示。            |
| CTA              | បើក PayEase ក្នុង Telegram                                                                                                                           | Open PayEase in Telegram                                                                                                                               | 在 Telegram 中打开 PayEase                                                            |
| Notice           | ការសម្រេចចិត្តផ្នែកហិរញ្ញវត្ថុ និងលក្ខខណ្ឌកិច្ចសន្យា ត្រូវបានពិនិត្យដោយឯករាជ្យដោយស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណ។                                    | Financial decisions and agreement terms are independently reviewed by a licensed financial institution.                                                | 金融决定与合同条款由持牌金融机构独立审核。                                            |

## 5. 流程页 `/[locale]/how-it-works`

| 步骤 | 高棉语 `km`                                                           | English `en`                                                                    | 中文 `zh-CN`                          |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| 1    | អ្នកប្រើដាក់ពាក្យក្នុង PayEase និងបញ្ជាក់ការអនុញ្ញាតចាំបាច់។          | The user applies in PayEase and confirms the required consent.                  | 用户在 PayEase 中申请并确认必要授权。 |
| 2    | KhmerX ពិនិត្យភាពពេញលេញនៃព័ត៌មាន និងសម្របសម្រួលការផ្ទៀងផ្ទាត់សហគ្រាស។ | KhmerX checks information completeness and coordinates enterprise verification. | KhmerX 核对资料完整性并协调企业核验。 |
| 3    | សហគ្រាសផ្ទៀងផ្ទាត់តែព័ត៌មានបុគ្គលិកដែលបានអនុញ្ញាត។                    | The enterprise verifies only authorised employee information.                   | 企业仅核验已获授权的员工信息。        |
| 4    | ស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណពិនិត្យឯករាជ្យ និងកំណត់លក្ខខណ្ឌ។       | The licensed financial institution independently reviews and determines terms.  | 持牌金融机构独立审核并决定条款。      |
| 5    | អ្នកប្រើពិនិត្យលក្ខខណ្ឌ កិច្ចសន្យា វិក្កយបត្រ និងការគាំទ្រការទូទាត់។  | The user reviews the offer, agreement, bills and repayment support.             | 用户查看报价、合同、账单与还款支持。  |

## 6. 企业合作页 `/[locale]/for-enterprises`

| 字段        | 高棉语 `km`                                                                                                             | English `en`                                                                                                                    | 中文 `zh-CN`                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| H1          | កិច្ចសហការសហគ្រាសដោយមានព្រំដែនច្បាស់លាស់                                                                                | Enterprise collaboration with clear boundaries                                                                                  | 边界清晰的企业协作                                                   |
| Intro       | KhmerX Enterprise ជួយសហគ្រាសគ្រប់គ្រងការងារផ្ទៀងផ្ទាត់បុគ្គលិកដែលបានអនុញ្ញាត ដោយមិនចូលរួមក្នុងការសម្រេចចិត្តផ្នែកឥណទាន។ | KhmerX Enterprise helps organisations manage authorised employee-verification tasks without participating in lending decisions. | KhmerX Enterprise 帮助企业管理经授权的员工核验待办，不参与信贷决策。 |
| Card 1      | ការផ្ទៀងផ្ទាត់តាមអ្នកជួល                                                                                                | Employer verification                                                                                                           | 员工信息核验                                                         |
| Card 1 body | ផ្ទៀងផ្ទាត់ស្ថានភាពការងារ និងព័ត៌មានដែលបានអនុញ្ញាតក្នុងព្រំដែនរបស់សហគ្រាស។                                              | Verify employment status and authorised information within the enterprise boundary.                                             | 在企业边界内核验在职状态与已授权信息。                               |
| Card 2      | ការការពារទិន្នន័យ                                                                                                       | Data boundaries                                                                                                                 | 数据边界                                                             |
| Card 2 body | មិនបង្ហាញកិច្ចសន្យា ថ្លៃសេវា វិក្កយបត្រ ឬព័ត៌មានទំនាក់ទំនងបន្ទាន់ទៅកាន់ HR។                                             | HR does not see agreements, fees, bills or emergency-contact details.                                                           | HR 不查看合同、费用、账单或紧急联系人信息。                          |
| CTA         | ពិគ្រោះអំពីកិច្ចសហការសហគ្រាស                                                                                            | Discuss enterprise collaboration                                                                                                | 咨询企业合作                                                         |

## 7. 金融机构合作页 `/[locale]/for-financial-partners`

| 字段         | 高棉语 `km`                                                                                                                  | English `en`                                                                                                                    | 中文 `zh-CN`                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1           | កិច្ចសហការជាមួយស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណ                                                                               | Collaboration for licensed financial institutions                                                                               | 面向持牌金融机构的协作能力                                                  |
| Intro        | KhmerX Partner គាំទ្រការសហការដែលអាចគ្រប់គ្រង និងសវនកម្មបាន ខណៈដែលស្ថាប័នរក្សាការគ្រប់គ្រងឯករាជ្យលើការសម្រេចចិត្តហិរញ្ញវត្ថុ។ | KhmerX Partner supports governed, auditable collaboration while institutions retain independent control of financial decisions. | KhmerX Partner 支持可治理、可审计的协作，同时机构保持对金融决策的独立控制。 |
| Capability 1 | សិទ្ធិ និងលំហូរអនុម័ត                                                                                                        | Role-based workflows                                                                                                            | 角色化审批流程                                                              |
| Capability 2 | កិច្ចសន្យា ការបញ្ចេញប្រាក់ និងការផ្ទៀងផ្ទាត់ការទូទាត់                                                                        | Agreements, disbursement and reconciliation                                                                                     | 合同、放款与核销对账                                                        |
| Capability 3 | ស្នាមសវនកម្ម និងការតភ្ជាប់ដែលគ្រប់គ្រង                                                                                       | Audit trail and governed integrations                                                                                           | 审计链路与受控连接器                                                        |
| CTA          | ចាប់ផ្តើមការពិភាក្សាជាមួយដៃគូ                                                                                                | Start a partner conversation                                                                                                    | 发起合作洽谈                                                                |

## 8. 安全与治理页 `/[locale]/security-and-governance`

| 字段        | 高棉语 `km`                                                                                            | English `en`                                                                                          | 中文 `zh-CN`                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| H1          | សុវត្ថិភាព ទិន្នន័យ និងអភិបាលកិច្ច                                                                     | Security, data and governance                                                                         | 安全、数据与治理                                              |
| Intro       | KhmerX រចនាដំណើរការដោយផ្អែកលើការប្រើទិន្នន័យតិចបំផុត ការគ្រប់គ្រងសិទ្ធិ ការញែកអ្នកជួល និងស្នាមសវនកម្ម។ | KhmerX designs workflows around data minimisation, access control, tenant isolation and auditability. | KhmerX 围绕数据最小化、权限控制、租户隔离与审计能力设计流程。 |
| Principle 1 | ទិន្នន័យតិចបំផុត                                                                                       | Minimum necessary data                                                                                | 最小必要数据                                                  |
| Principle 2 | សិទ្ធិតាមតួនាទី                                                                                        | Least-privilege access                                                                                | 最小权限访问                                                  |
| Principle 3 | ការញែកអ្នកជួល                                                                                          | Tenant isolation                                                                                      | 租户隔离                                                      |
| Principle 4 | ស្នាមសវនកម្ម                                                                                           | Traceable actions                                                                                     | 操作可追溯                                                    |
| Notice      | ព័ត៌មានលម្អិតអំពីការអនុវត្ត និងលក្ខខណ្ឌច្បាប់ នឹងត្រូវធ្វើបច្ចុប្បន្នភាពតាមកំណែគោលការណ៍ដែលបានអនុម័ត។   | Implementation details and legal terms are updated through approved policy versions.                  | 具体实现与法律条款以已批准的政策版本为准。                    |

## 9. 费用披露页 `/[locale]/fees-and-disclosure`

> ⚠ 法务审校：本页只说明披露原则，不应在未完成法律及产品规则审核前写入任何具体费率、税费或合同解释。

| 字段   | 高棉语 `km`                                                                      | English `en`                                                                           | 中文 `zh-CN`                                       |
| ------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| H1     | ការបង្ហាញលក្ខខណ្ឌ និងថ្លៃសេវាដោយច្បាស់លាស់                                       | Clear terms and fee disclosure                                                         | 清晰展示条款与费用                                 |
| Intro  | មុនពេលអ្នកប្រើបញ្ជាក់លក្ខខណ្ឌដែលបានអនុម័ត ព័ត៌មានសំខាន់ៗនឹងត្រូវបង្ហាញឱ្យច្បាស់។ | Before a user confirms approved terms, the key information is shown clearly.           | 用户确认已批准条款前，关键金额与信息将被清晰展示。 |
| Item 1 | ចំនួនទឹកប្រាក់ដែលបានអនុម័ត                                                       | Approved amount                                                                        | 批准金额                                           |
| Item 2 | ថ្លៃសេវា និងការប្រាក់ (បើអនុវត្ត)                                                | Fees and interest, where applicable                                                    | 服务费与利息（如适用）                             |
| Item 3 | ចំនួនទទួលបានពិតប្រាកដ និងចំនួនត្រូវសង                                            | Amount received and repayment due                                                      | 实际到账与到期应还                                 |
| Item 4 | រយៈពេល កាលបរិច្ឆេទសង និងកំណែកិច្ចសន្យា                                           | Term, due date and agreement version                                                   | 期限、还款日与合同版本                             |
| Notice | លក្ខខណ្ឌចុងក្រោយអាស្រ័យលើការពិនិត្យឯករាជ្យ និងកិច្ចសន្យាដែលត្រូវបញ្ជាក់។         | Final terms depend on independent review and the agreement presented for confirmation. | 最终条款以独立审核及确认时展示的合同为准。         |

## 10. 帮助中心 `/[locale]/help`

| 字段   | 高棉语 `km`                                                                                | English `en`                                                                              | 中文 `zh-CN`                                        |
| ------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| H1     | ជំនួយ និងសំណួរដែលសួរញឹកញាប់                                                                | Help and frequently asked questions                                                       | 帮助与常见问题                                      |
| Intro  | ស្វែងរកការណែនាំអំពីការដាក់ពាក្យ លក្ខខណ្ឌ កិច្ចសន្យា វិក្កយបត្រ ការបង់ប្រាក់ និងសុវត្ថិភាព។ | Find guidance on applications, terms, agreements, bills, repayment and safety.            | 查找申请、条款、合同、账单、还款与安全相关指引。    |
| CTA    | ទាក់ទង KhmerXBot                                                                           | Contact KhmerXBot                                                                         | 联系 KhmerXBot                                      |
| Safety | សូមកុំផ្តល់ពាក្យសម្ងាត់ OTP លេខកាតពេញលេញ ឬលេខឯកសារអត្តសញ្ញាណពេញលេញតាមរយៈការជជែក។           | Never share passwords, OTPs, full card numbers or full identity-document numbers in chat. | 请勿在聊天中提供密码、OTP、完整卡号或完整证件号码。 |

### 10.1 FAQ

| 问题 / 答案                | 高棉语 `km`                                                                                                                | English `en`                                                                                                                                 | 中文 `zh-CN`                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| KhmerX 与 PayEase 的关系？ | KhmerX គឺជាវេទិកា ហើយ PayEase គឺជាផលិតផលសម្រាប់បុគ្គលរបស់ KhmerX។                                                          | KhmerX is the platform; PayEase is KhmerX's product for individuals.                                                                         | KhmerX 是平台；PayEase 是 KhmerX 面向个人的产品。                     |
| 谁决定额度与合同？         | ស្ថាប័នហិរញ្ញវត្ថុមានអាជ្ញាបណ្ណពិនិត្យដោយឯករាជ្យ និងបង្ហាញលក្ខខណ្ឌមុនពេលបញ្ជាក់។                                           | A licensed financial institution independently reviews and presents the terms before confirmation.                                           | 持牌金融机构独立审核，并在确认前展示条款。                            |
| 企业核验什么？             | សហគ្រាសផ្ទៀងផ្ទាត់តែព័ត៌មានបុគ្គលិកដែលបានអនុញ្ញាតក្នុងព្រំដែនរបស់ខ្លួន។                                                    | The enterprise verifies only authorised employee information within its own boundary.                                                        | 企业仅在自身边界内核验已授权的员工信息。                              |
| 何时看到费用？             | ព័ត៌មានសំខាន់ៗនឹងត្រូវបង្ហាញមុនពេលអ្នកបញ្ជាក់លក្ខខណ្ឌដែលបានអនុម័ត។                                                         | Key information is shown before you confirm approved terms.                                                                                  | 在确认已批准条款前展示关键金额与信息。                                |
| 上传还款凭证后是否结清？   | ការដាក់ស្នើភស្តុតាងបង់ប្រាក់មិនមានន័យថាបានបញ្ចប់ការទូទាត់ទេ។ វាត្រូវរង់ចាំការផ្ទៀងផ្ទាត់។                                  | Submitting payment proof does not mean the payment is settled. It awaits verification.                                                       | 上传还款凭证不代表已经结清，仍需等待核验。                            |
| 如何投诉？                 | អ្នកអាចទាក់ទង KhmerXBot តាមបណ្តាញផ្លូវការ។ ករណីកិច្ចសន្យា ការបញ្ចេញប្រាក់ ឬការប្រមូលបំណុល នឹងបញ្ជូនទៅស្ថាប័នមានសមត្ថកិច្ច។ | Contact KhmerXBot through the official channel. Agreement, disbursement or collections complaints are routed to the responsible institution. | 请通过官方 KhmerXBot 联系。合同、放款或催收类投诉将转交负责机构处理。 |

## 11. 关于页 `/[locale]/about`

| 字段          | 高棉语 `km`                                                                                                                    | English `en`                                                                                                                                   | 中文 `zh-CN`                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| H1            | អំពី KhmerX                                                                                                                    | About KhmerX                                                                                                                                   | 关于 KhmerX                                                           |
| Intro         | KhmerX មានបំណងគាំទ្រការអភិវឌ្ឍសេដ្ឋកិច្ចឌីជីថលរបស់កម្ពុជា តាមរយៈដំណោះស្រាយដែលអាចទុកចិត្តបាន អាចយល់បាន និងអាចគ្រប់គ្រងបាន។      | KhmerX aims to support Cambodia's digital-economy development through trusted, understandable and governed digital services.                   | KhmerX 希望通过可信、易理解、可治理的数字服务支持柬埔寨数字经济发展。 |
| Khmer meaning | `Khmer` សំដៅលើកម្ពុជា អ្នកប្រើក្នុងស្រុក សហគ្រាសក្នុងស្រុក និងសេវាឌីជីថលក្នុងស្រុក។                                            | `Khmer` points to Cambodia, local users, local enterprises and local digital services.                                                         | `Khmer` 指向柬埔寨、本地用户、本地企业与本地数字服务。                |
| X meaning     | `X` តំណាងឱ្យភាពបើកចំហ ការពង្រីក និងការតភ្ជាប់សម្រាប់សេវាកម្មអនាគត។                                                             | `X` represents openness, expansion and connection for future services.                                                                         | `X` 代表开放、延展与连接，可承载未来服务。                            |
| Notice        | KhmerX គាំទ្រទិសដៅសេដ្ឋកិច្ចឌីជីថល ប៉ុន្តែមិនអះអាងថាមានការគាំទ្រផ្លូវការពីរដ្ឋាភិបាល ឬនិយតករ ដោយគ្មានភស្តុតាងជាលាយលក្ខណ៍អក្សរ។ | KhmerX supports the direction of digital-economy development; it does not claim government or regulatory endorsement without written evidence. | KhmerX 支持数字经济发展方向；未经书面依据，不声称获得政府或监管背书。 |

## 12. 联系页 `/[locale]/contact`

| 字段        | 高棉语 `km`                                                                                | English `en`                                                                                                         | 中文 `zh-CN`                                                 |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| H1          | ទាក់ទង KhmerX                                                                              | Contact KhmerX                                                                                                       | 联系 KhmerX                                                  |
| Intro       | ជ្រើសរើសប្រភេទសំណើរបស់អ្នក ដើម្បីឱ្យយើងបញ្ជូនទៅក្រុមដែលសមស្រប។                             | Choose your enquiry type so it can be routed to the appropriate team.                                                | 请选择咨询类型，我们将转交合适的团队。                       |
| Type 1      | កិច្ចសហការសហគ្រាស                                                                          | Enterprise collaboration                                                                                             | 企业合作                                                     |
| Type 2      | កិច្ចសហការស្ថាប័នហិរញ្ញវត្ថុ                                                               | Financial-partner collaboration                                                                                      | 金融机构合作                                                 |
| Type 3      | សំណួរទូទៅ                                                                                  | General enquiry                                                                                                      | 一般咨询                                                     |
| Form notice | សូមកុំផ្ញើឯកសារអត្តសញ្ញាណ ព័ត៌មានកាតធនាគារ កិច្ចសន្យា ឬព័ត៌មានផ្ទាល់ខ្លួនរសើបតាមទម្រង់នេះ។ | Do not submit identity documents, bank-card details, agreements or sensitive personal information through this form. | 请勿通过本表单提交证件、银行卡信息、合同或其他敏感个人资料。 |
| Submit      | ផ្ញើសំណើ                                                                                   | Send enquiry                                                                                                         | 提交咨询                                                     |

## 13. 法律页面标签（不含法律正文）

> ⚠ 法务审校：以下仅为页面标题与状态提示。隐私、条款、Cookie、投诉处理的正文必须由柬埔寨当地法务及相应责任主体批准后，按版本、生效日期、适用主体、联系渠道发布。

| 页面       | 高棉语 `km`                                          | English `en`                                       | 中文 `zh-CN`                   |
| ---------- | ---------------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| Privacy    | គោលការណ៍ឯកជនភាព                                      | Privacy policy                                     | 隐私政策                       |
| Terms      | លក្ខខណ្ឌប្រើប្រាស់                                   | Terms of use                                       | 使用条款                       |
| Complaints | នីតិវិធីដោះស្រាយបណ្តឹង                               | Complaints procedure                               | 投诉处理程序                   |
| Cookies    | គោលការណ៍ខូគី                                         | Cookie policy                                      | Cookie 政策                    |
| Pending    | ខ្លឹមសារនេះកំពុងរង់ចាំការពិនិត្យ និងអនុម័តតាមច្បាប់។ | This content is pending legal review and approval. | 本内容正在等待法律审查与批准。 |

## 14. Trae 落地规则

1. 表格中每个文案先进入结构化 i18n key；不要在 Astro / React 组件硬编码。
2. 高棉语条目在 Content Collection 中默认 `status: "review"`，完成母语及合规审校后才允许 `published`。
3. 所有 H1、描述、FAQ、JSON-LD 和正文必须复用同一事实源，避免 SEO / GEO 与页面正文口径不一致。
4. Contact 和咨询表单的成功消息只在后端确认接收后显示；没有后端时使用“我们会通过确认的联系渠道回复”，不能伪造提交成功。
5. 法律页不能以这份文案替代正式法务文件。
