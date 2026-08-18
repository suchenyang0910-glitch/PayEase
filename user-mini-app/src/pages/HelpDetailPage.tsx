import type { LanguageCode } from "@payease/v1-domain";

type HelpTopic = "guide" | "safety";

type Props = Readonly<{
  language: LanguageCode;
  topic: HelpTopic;
  onBack: () => void;
}>;

function topicCopy(language: LanguageCode, topic: HelpTopic) {
  if (topic === "guide") {
    return {
      title:
        language === "zh-CN"
          ? "借款指南"
          : language === "km"
            ? "គោលការណ៍ខ្ចីប្រាក់"
            : "How to borrow",
      backHint:
        language === "zh-CN"
          ? "返回首页"
          : language === "km"
            ? "ត្រឡប់ទៅទំព័រដើម"
            : "Back to Home",
      intro:
        language === "zh-CN"
          ? "按步骤完成资料填写、等待审核，并在结果确认后查看账单与还款安排。借款申请、审核结果、费用展示与后续还款，都会在 PayEase 页面内完成。"
          : language === "km"
            ? "បំពេញព័ត៌មានតាមជំហាន រង់ចាំការពិនិត្យ ហើយពិនិត្យវិក្កយបត្រ និងផែនការសងប្រាក់បន្ទាប់ពីលទ្ធផលត្រូវបានបញ្ជាក់។ ការដាក់ពាក្យ លទ្ធផលពិនិត្យ ការបង្ហាញថ្លៃ និងការសងប្រាក់បន្ទាប់ នឹងធ្វើនៅក្នុងទំព័រ PayEase ទាំងអស់។"
            : "Complete your information step by step, wait for review, and check the bill and repayment plan after the result is confirmed. Application submission, review results, fee disclosure, and follow-up repayment all happen inside PayEase.",
      summaryTitle:
        language === "zh-CN"
          ? "适用范围"
          : language === "km"
            ? "វិសាលភាពការប្រើប្រាស់"
            : "What this guide covers",
      summaryBody:
        language === "zh-CN"
          ? "本指南仅说明申请流程与页面使用方式，不构成审批承诺。额度、费用、合同条款与放款安排，以合作持牌机构的最终审核结果为准。"
          : language === "km"
            ? "សេចក្តីណែនាំនេះពន្យល់តែអំពីដំណើរការដាក់ពាក្យ និងរបៀបប្រើទំព័រ ប៉ុណ្ណោះ មិនមែនជាការសន្យាអនុម័តទេ។ ចំនួន ថ្លៃ ល័ក្ខខ័ណ្ឌកិច្ចសន្យា និងការបើកប្រាក់ អាស្រ័យលើលទ្ធផលពិនិត្យចុងក្រោយរបស់ស្ថាប័នមានអាជ្ញាប័ណ្ណ។"
            : "This guide explains the application flow and how to use the pages. It is not an approval commitment. Amount, fees, contract terms, and disbursement depend on the licensed institution's final review.",
      sections:
        language === "zh-CN"
          ? [
              {
                title: "申请前准备",
                items: [
                  "确认手机号可正常接听，并准备真实、完整的基础资料。",
                  "如页面要求选择工厂、填写身份证件或收款账户，请确保信息与你本人一致。",
                  "请只在官方页面内填写资料，不要将证件信息发送给私人账号或群聊。",
                ],
              },
              {
                title: "申请流程",
                items: [
                  "先填写基础资料、联系人、工厂与收款账户，再进入补充资料与确认提交。",
                  "提交前请逐步检查每一项内容；如发现错误，可返回上一步修改后再继续。",
                  "提交审核后，申请会进入资料审核或额度审核阶段，状态变更会通过页面和通知展示。",
                ],
              },
              {
                title: "审核结果与后续",
                items: [
                  "审核中请保持电话畅通，并留意通知页是否要求补充资料。",
                  "若申请通过，页面会展示额度、费用、合同确认或账单信息；请在确认前仔细阅读。",
                  "若申请未通过或需要重新评估，请以页面提示与通知说明为准。",
                ],
              },
            ]
          : language === "km"
            ? [
                {
                  title: "ការរៀបចំមុនដាក់ពាក្យ",
                  items: [
                    "សូមធានាថាលេខទូរស័ព្ទអាចទាក់ទងបាន ហើយរៀបចំព័ត៌មានមូលដ្ឋានពិត និងពេញលេញ។",
                    "បើទំព័រទាមទារជ្រើសរោងចក្រ បំពេញឯកសារអត្តសញ្ញាណ ឬគណនីទទួលប្រាក់ សូមធានាថាព័ត៌មានទាំងនោះត្រូវនឹងអ្នកផ្ទាល់។",
                    "សូមបំពេញព័ត៌មានតែក្នុងទំព័រផ្លូវការ ហើយកុំផ្ញើព័ត៌មានឯកសារទៅគណនីឯកជន ឬក្រុមជជែក។",
                  ],
                },
                {
                  title: "ដំណើរការដាក់ពាក្យ",
                  items: [
                    "បំពេញព័ត៌មានមូលដ្ឋាន អ្នកទំនាក់ទំនង រោងចក្រ និងគណនីទទួលប្រាក់ជាមុន សិន បន្ទាប់មកបន្តទៅព័ត៌មានបន្ថែម និងការបញ្ជាក់ដាក់ស្នើ។",
                    "មុនដាក់ស្នើ សូមពិនិត្យព័ត៌មានរាល់ជំហាន។ ប្រសិនបើមានកំហុស អ្នកអាចត្រឡប់ទៅជំហានមុនដើម្បីកែប្រែបាន។",
                    "បន្ទាប់ពីដាក់ស្នើ ពាក្យនឹងចូលដំណាក់កាលពិនិត្យព័ត៌មាន ឬវាយតម្លៃកម្រិតឥណទាន ហើយស្ថានភាពនឹងបង្ហាញក្នុងទំព័រ និងសារ​ជូនដំណឹង។",
                  ],
                },
                {
                  title: "លទ្ធផលពិនិត្យ និងជំហានបន្ទាប់",
                  items: [
                    "នៅពេលកំពុងពិនិត្យ សូមរក្សាទូរស័ព្ទឱ្យអាចទាក់ទងបាន និងពិនិត្យសារ​ជូនដំណឹងសម្រាប់ព័ត៌មានបន្ថែម។",
                    "បើពាក្យត្រូវបានអនុម័ត ទំព័រនឹងបង្ហាញកម្រិតឥណទាន ថ្លៃ ការបញ្ជាក់កិច្ចសន្យា ឬវិក្កយបត្រ។ សូមអានដោយប្រុងប្រយ័ត្នមុនពេលបញ្ជាក់។",
                    "បើពាក្យមិនត្រូវបានអនុម័ត ឬត្រូវការវាយតម្លៃឡើងវិញ សូមអនុវត្តតាមសេចក្តីណែនាំនៅលើទំព័រ និងសារ​ជូនដំណឹង។",
                  ],
                },
              ]
            : [
                {
                  title: "Before you apply",
                  items: [
                    "Make sure your phone is reachable and prepare complete, truthful profile information.",
                    "If the page asks for a factory, identity document, or payout account, make sure the information matches you.",
                    "Enter your information only on official PayEase pages. Do not send identity details to private accounts or group chats.",
                  ],
                },
                {
                  title: "Application flow",
                  items: [
                    "Fill in your profile, contacts, factory, and payout account before moving to supplements and final confirmation.",
                    "Review each step before submitting. If anything is wrong, go back, update it, and continue again.",
                    "After submission, the application moves into document review or credit review, and status changes appear on the page and in notifications.",
                  ],
                },
                {
                  title: "Review result and next steps",
                  items: [
                    "Keep your phone reachable during review and check notifications for any additional information requests.",
                    "If approved, the page will show the amount, fees, contract confirmation, or bill details. Read everything carefully before confirming.",
                    "If the application is not approved or a reassessment is available, follow the instructions shown on the page and in notifications.",
                  ],
                },
              ],
      noticeTitle:
        language === "zh-CN"
          ? "官方提醒"
          : language === "km"
            ? "សេចក្តីជូនដំណឹងផ្លូវការ"
            : "Official reminder",
      noticeBody:
        language === "zh-CN"
          ? "额度、费用与合同条款以最终审核结果为准。请按时还款，避免因逾期影响后续服务使用。"
          : language === "km"
            ? "ចំនួន ថ្លៃ និងល័ក្ខខ័ណ្ឌកិច្ចសន្យា អាស្រ័យលើលទ្ធផលពិនិត្យចុងក្រោយ។ សូមសងប្រាក់ទាន់ពេល ដើម្បីជៀសវាងការប៉ះពាល់ដល់ការប្រើប្រាស់សេវាកម្មបន្ទាប់។"
            : "Amount, fees, and contract terms depend on the final review result. Repay on time to avoid affecting your access to future services.",
    };
  }

  return {
    title:
      language === "zh-CN"
        ? "安全防骗"
        : language === "km"
          ? "ការពារប្រឆាំងការបោកប្រាស់"
          : "Stay safe from scams",
    backHint:
      language === "zh-CN"
        ? "返回首页"
        : language === "km"
          ? "ត្រឡប់ទៅទំព័រដើម"
          : "Back to Home",
    intro:
      language === "zh-CN"
        ? "请只通过 PayEase 官方页面和通知处理申请，不向陌生人透露验证码、密码或完整身份信息。涉及审批、费用、还款与补件的提醒，请以官方页面和通知为准。"
        : language === "km"
          ? "សូមដំណើរការពាក្យតាមទំព័រ និងសារ​ជូនដំណឹងផ្លូវការរបស់ PayEase ប៉ុណ្ណោះ ហើយកុំប្រាប់កូដផ្ទៀងផ្ទាត់ ពាក្យសម្ងាត់ ឬព័ត៌មានអត្តសញ្ញាណពេញលេញទៅអ្នកមិនស្គាល់។ ការរំលឹកអំពីការអនុម័ត ថ្លៃ ការសងប្រាក់ និងការបំពេញឯកសារ សូមយោងតាមទំព័រ និងសារ​ជូនដំណឹងផ្លូវការ។"
          : "Handle your application only through official PayEase pages and notifications. Never share verification codes, passwords, or full identity details with strangers. For approval, fees, repayment, or additional-document requests, rely only on official pages and notifications.",
    summaryTitle:
      language === "zh-CN"
        ? "高风险提醒"
        : language === "km"
          ? "ការរំលឹកហានិភ័យខ្ពស់"
          : "High-risk reminder",
    summaryBody:
      language === "zh-CN"
        ? "任何以“包过审核”“内部渠道”“先转账后放款”为理由索要费用、验证码或个人资料的行为，都应视为高风险。"
        : language === "km"
          ? "រាល់ការស្នើសុំថ្លៃ កូដផ្ទៀងផ្ទាត់ ឬព័ត៌មានផ្ទាល់ខ្លួន ដោយយកហេតុផលថា “អនុម័តជាក់ជាមិនខាន” “មានច្រកផ្លូវខាងក្នុង” ឬ “ផ្ទេរប្រាក់ជាមុនសិន” គួរត្រូវបានចាត់ទុកថាជាហានិភ័យខ្ពស់។"
          : "Treat any request for fees, verification codes, or personal information justified by guaranteed approval, internal channels, or pay-first disbursement promises as high risk.",
    sections:
      language === "zh-CN"
        ? [
            {
              title: "识别常见风险",
              items: [
                "不要相信私下承诺“包过审核”“先交手续费”“代办放款”的个人或群聊消息。",
                "官方不会要求你通过私人账号转账，也不会以聊天方式索要验证码或登录密码。",
                "如果对方催促你立刻操作、转账或提供证件原图，请先暂停并核实。",
              ],
            },
            {
              title: "保护资料与资金",
              items: [
                "不要把身份证件、银行卡、验证码、支付密码发送给陌生人。",
                "还款前请核对页面内的官方指引，异常情况优先联系客服确认。",
                "请只通过 PayEase 页面内展示的流程提交资料、查看通知和处理账单。",
              ],
            },
            {
              title: "遇到异常时怎么做",
              items: [
                "如发现可疑链接、账号或付款要求，请立即停止操作。",
                "保留相关截图、消息记录和付款信息，便于后续核实。",
                "通过官方入口联系客服或投诉，不要继续与可疑账号私下沟通。",
              ],
            },
          ]
        : language === "km"
          ? [
              {
                title: "ស្គាល់ហានិភ័យទូទៅ",
                items: [
                  "កុំជឿលើសារ​ឯកជន ឬក្រុមជជែកដែលសន្យាថា “អនុម័តជាក់ជាមិនខាន” “បង់ថ្លៃជាមុន” ឬ “ជួយបើកប្រាក់ជំនួស”។",
                  "ផ្លូវការមិនតម្រូវឱ្យអ្នកផ្ទេរប្រាក់ទៅគណនីឯកជន ហើយក៏មិនស្នើសុំកូដផ្ទៀងផ្ទាត់ ឬពាក្យសម្ងាត់តាមការជជែកផងដែរ។",
                  "ប្រសិនបើមានអ្នកជំរុញឱ្យអ្នកធ្វើប្រតិបត្តិការភ្លាមៗ ផ្ទេរប្រាក់ ឬផ្តល់រូបថតឯកសារដើម សូមផ្អាកជាមុន និងផ្ទៀងផ្ទាត់សិន។",
                ],
              },
              {
                title: "ការពារព័ត៌មាន និងទ្រព្យសម្បត្តិ",
                items: [
                  "កុំផ្ញើឯកសារអត្តសញ្ញាណ កាតធនាគារ កូដផ្ទៀងផ្ទាត់ ឬពាក្យសម្ងាត់ទូទាត់ទៅអ្នកមិនស្គាល់។",
                  "មុនសងប្រាក់ សូមផ្ទៀងផ្ទាត់ការណែនាំផ្លូវការនៅក្នុងទំព័រ ហើយទាក់ទងសេវាកម្មប្រសិនបើមានអ្វីមិនប្រក្រតី។",
                  "សូមប្រើតែដំណើរការដែលបង្ហាញក្នុងទំព័រ PayEase សម្រាប់ដាក់ឯកសារ មើលសារ​ជូនដំណឹង និងដោះស្រាយវិក្កយបត្រ។",
                ],
              },
              {
                title: "ត្រូវធ្វើអ្វីនៅពេលមានភាពមិនប្រក្រតី",
                items: [
                  "ប្រសិនបើឃើញតំណភ្ជាប់ គណនី ឬការស្នើសុំបង់ប្រាក់គួរឱ្យសង្ស័យ សូមឈប់ប្រតិបត្តិភ្លាមៗ។",
                  "រក្សាទុករូបថតអេក្រង់ កំណត់ត្រាសារ និងព័ត៌មានទូទាត់សម្រាប់ការផ្ទៀងផ្ទាត់បន្ថែម។",
                  "ទាក់ទងសេវាកម្ម ឬដាក់ពាក្យបណ្តឹងតាមច្រកផ្លូវការ ហើយកុំបន្តទំនាក់ទំនងឯកជនជាមួយគណនីគួរឱ្យសង្ស័យ។",
                ],
              },
            ]
          : [
              {
                title: "Spot common scam patterns",
                items: [
                  "Do not trust private messages or group chats promising guaranteed approval, upfront-fee processing, or disbursement by proxy.",
                  "Official support will not ask you to transfer money to a private account, and it will not request verification codes or login passwords through chat.",
                  "If someone pressures you to act immediately, transfer money, or send original identity images, pause first and verify.",
                ],
              },
              {
                title: "Protect your information and funds",
                items: [
                  "Never share identity documents, bank cards, verification codes, or payment passwords with strangers.",
                  "Before making a repayment, verify the official instructions shown in the app and contact support if anything looks unusual.",
                  "Use only the flows displayed inside PayEase to submit materials, review notifications, and handle bills.",
                ],
              },
              {
                title: "What to do if something looks wrong",
                items: [
                  "If you see a suspicious link, account, or payment request, stop immediately.",
                  "Keep screenshots, chat history, and payment records so the issue can be checked later.",
                  "Contact official support or file a complaint through the official entry point instead of continuing private conversations with the suspicious account.",
                ],
              },
            ],
    noticeTitle:
      language === "zh-CN"
        ? "官方提醒"
        : language === "km"
          ? "សេចក្តីជូនដំណឹងផ្លូវការ"
          : "Official reminder",
    noticeBody:
      language === "zh-CN"
        ? "如页面展示的信息与他人私下告知的不一致，请以页面内正式展示内容为准。任何要求脱离官方流程操作的行为，都应谨慎对待。"
        : language === "km"
          ? "ប្រសិនបើព័ត៌មាននៅលើទំព័រមិនស្របនឹងអ្វីដែលមានអ្នកប្រាប់ជាឯកជន សូមយកព័ត៌មានក្នុងទំព័រផ្លូវការជាគោល។ រាល់ការស្នើឱ្យអ្នកបោះបង់ដំណើរការផ្លូវការ គួរត្រូវបានពិចារណាដោយប្រុងប្រយ័ត្ន។"
          : "If information shown on the page conflicts with what someone tells you privately, follow the formal information displayed in the app. Treat any request to move outside the official process with caution.",
  };
}

export function HelpDetailPage({
  language,
  topic,
  onBack,
}: Props): JSX.Element {
  const copy = topicCopy(language, topic);
  return (
    <section
      className="page page--help-detail"
      aria-labelledby="help-detail-title"
    >
      <header className="page__header">
        <h2 id="help-detail-title" className="page__title">
          {copy.title}
        </h2>
        <button
          type="button"
          className="secondary back-link"
          onClick={onBack}
          aria-label={copy.backHint}
        >
          {copy.backHint}
        </button>
      </header>
      <div className="page__body" data-page-anchor="help-detail">
        <section className="borrow-entry-card">
          <p className="borrow-entry-card__status">{copy.summaryTitle}</p>
          <p className="borrow-entry-card__description">{copy.intro}</p>
          <p className="page__hint">{copy.summaryBody}</p>
        </section>
        {copy.sections.map((section) => (
          <section
            key={`${topic}-${section.title}`}
            className="profile-list"
            aria-label={section.title}
          >
            {section.items.map((item, index) => (
              <div key={`${topic}-${section.title}-${index + 1}`}>
                <dt>{index === 0 ? section.title : `• ${section.title}`}</dt>
                <dd>{item}</dd>
              </div>
            ))}
          </section>
        ))}
        <section className="borrow-entry-card">
          <p className="borrow-entry-card__status">{copy.noticeTitle}</p>
          <p className="borrow-entry-card__description">{copy.noticeBody}</p>
        </section>
      </div>
    </section>
  );
}
