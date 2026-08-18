import type { LanguageCode } from "@payease/v1-domain";
import type { ApplicantServiceCase } from "../../service-case-list.ts";
import { USER_SKELETON_COPY } from "../../copy/user-copy.ts";
import { ProfilePage } from "../../pages/ProfilePage.tsx";

type ServiceCaseType = "SERVICE_QUERY" | "COMPLAINT";

type ProfileWorkspaceProps = Readonly<{
  language: LanguageCode;
  trustedPhotoUrl: string | null;
  onProfilePhotoError: () => void;
  telegramLabel: string;
  displayName: string;
  usernameLine: string | null;
  phoneLabel: string;
  currentFactory: string | null;
  applicationSummary: string;
  billSummary: string;
  languageLabel: string;
  serviceCaseType: ServiceCaseType;
  onServiceCaseTypeChange: (value: ServiceCaseType) => void;
  serviceCaseMessage: string;
  onServiceCaseMessageChange: (value: string) => void;
  loading: boolean;
  serviceCasesLoading: boolean;
  onSubmitServiceCase: () => void;
  onLoadServiceCases: () => void;
  serviceCaseNotice: string;
  serviceCasesLoaded: boolean;
  serviceCases: readonly ApplicantServiceCase[];
  serviceCaseLabel: (serviceCase: ApplicantServiceCase) => string;
}>;

export function ProfileWorkspace({
  language,
  trustedPhotoUrl,
  onProfilePhotoError,
  telegramLabel,
  displayName,
  usernameLine,
  phoneLabel,
  currentFactory,
  applicationSummary,
  billSummary,
  languageLabel,
  serviceCaseType,
  onServiceCaseTypeChange,
  serviceCaseMessage,
  onServiceCaseMessageChange,
  loading,
  serviceCasesLoading,
  onSubmitServiceCase,
  onLoadServiceCases,
  serviceCaseNotice,
  serviceCasesLoaded,
  serviceCases,
  serviceCaseLabel,
}: ProfileWorkspaceProps): JSX.Element {
  const copy = USER_SKELETON_COPY[language].profile;

  return (
    <ProfilePage language={language}>
      <section className="profile-hero" aria-label="Telegram profile">
        <div className="profile-hero__avatar" aria-hidden="true">
          {trustedPhotoUrl ? (
            <img src={trustedPhotoUrl} alt="" onError={onProfilePhotoError} />
          ) : (
            <span>KX</span>
          )}
        </div>
        <div className="profile-hero__body">
          <p className="profile-hero__status">
            <span className="profile-hero__status-dot" />
            {telegramLabel}
          </p>
          <h3 className="profile-hero__name">{displayName}</h3>
          {usernameLine ? (
            <p className="profile-hero__username">{usernameLine}</p>
          ) : null}
        </div>
      </section>
      <dl className="profile-list" aria-label="Profile overview">
        <div>
          <dt>{copy.telegram}</dt>
          <dd aria-label={copy.telegram}>
            {language === "en"
              ? "Service-controlled session profile"
              : language === "zh-CN"
                ? "服务端验签后的受控会话资料"
                : "ទិន្នន័យសម័យដែលបានផ្ទៀងផ្ទាត់ដោយម៉ាស៊ីនមេ"}
          </dd>
        </div>
        <div>
          <dt>{copy.phone}</dt>
          <dd aria-label={copy.phone}>{phoneLabel}</dd>
        </div>
        <div>
          <dt>{copy.factory}</dt>
          <dd aria-label={copy.factory}>{currentFactory ?? "—"}</dd>
        </div>
        <div>
          <dt>
            {language === "en"
              ? "My application"
              : language === "zh-CN"
                ? "我的申请"
                : "ពាក្យសុំរបស់ខ្ញុំ"}
          </dt>
          <dd aria-label="My application">{applicationSummary}</dd>
        </div>
        <div>
          <dt>
            {language === "en"
              ? "My bill"
              : language === "zh-CN"
                ? "我的账单"
                : "វិក្កយបត្ររបស់ខ្ញុំ"}
          </dt>
          <dd aria-label="My bill">{billSummary}</dd>
        </div>
        <div>
          <dt>{copy.language}</dt>
          <dd aria-label={copy.language}>{languageLabel}</dd>
        </div>
        <div>
          <dt>
            {language === "en"
              ? "Privacy and consent"
              : language === "zh-CN"
                ? "隐私与授权"
                : "ភាពឯកជន និងការអនុញ្ញាត"}
          </dt>
          <dd aria-label="Privacy and consent">
            {language === "en"
              ? "View signed service and authorization records"
              : language === "zh-CN"
                ? "查看已确认的服务协议与授权记录"
                : "មើលកំណត់ត្រាកិច្ចព្រមព្រៀងសេវា និងការអនុញ្ញាតដែលបានបញ្ជាក់"}
          </dd>
        </div>
        <div>
          <dt>{copy.support}</dt>
          <dd aria-label={copy.support}>KhmerXBot</dd>
        </div>
      </dl>
      <section className="next-payment" aria-label="Profile safety note">
        <strong>
          {language === "en"
            ? "Safety note"
            : language === "zh-CN"
              ? "安全说明"
              : "សេចក្តីជូនដំណឹងសុវត្ថិភាព"}
        </strong>
        <small>
          {language === "en"
            ? "We do not show Telegram ID, phone number, ID documents, bank account numbers, or internal scoring on this page."
            : language === "zh-CN"
              ? "本页不会展示 Telegram ID、手机号原文、证件、完整银行卡号或内部评分。"
              : "ទំព័រនេះមិនបង្ហាញ Telegram ID លេខទូរស័ព្ទដើម ឯកសារអត្តសញ្ញាណ លេខគណនីពេញលេញ ឬពិន្ទុខាងក្នុងទេ។"}
        </small>
      </section>
      <section
        className="support-card"
        aria-label="Customer support and complaints"
      >
        <div className="support-card__header">
          <strong>
            {language === "en"
              ? "Customer support and complaints"
              : language === "zh-CN"
                ? "客服与投诉"
                : "សេវាអតិថិជន និងបណ្តឹង"}
          </strong>
          <small>
            {language === "en"
              ? "For a complaint, the licensed lender is responsible for the final outcome. Do not include passwords, card numbers or one-time codes."
              : language === "zh-CN"
                ? "投诉将由相关团队继续处理。请勿填写密码、银行卡完整号码或一次性验证码。"
                : "សម្រាប់បណ្តឹង ស្ថាប័នមានអាជ្ញាប័ណ្ណទទួលខុសត្រូវលើលទ្ធផលចុងក្រោយ។ សូមកុំបញ្ចូលពាក្យសម្ងាត់ លេខកាតពេញលេញ ឬលេខកូដម្តងទៀត។"}
          </small>
        </div>
        <div className="support-card__form">
          <label className="field-label support-card__field">
            {language === "en"
              ? "Request type"
              : language === "zh-CN"
                ? "问题类型"
                : "ប្រភេទសំណើ"}
            <select
              value={serviceCaseType}
              onChange={(event) =>
                onServiceCaseTypeChange(event.target.value as ServiceCaseType)
              }
            >
              <option value="SERVICE_QUERY">
                {language === "en"
                  ? "Service question"
                  : language === "zh-CN"
                    ? "客服咨询"
                    : "សំណួរសេវាកម្ម"}
              </option>
              <option value="COMPLAINT">
                {language === "en"
                  ? "Complaint"
                  : language === "zh-CN"
                    ? "投诉"
                    : "បណ្តឹង"}
              </option>
            </select>
          </label>
          <label className="field-label support-card__field">
            {language === "en"
              ? "Tell us what happened"
              : language === "zh-CN"
                ? "请说明情况"
                : "សូមពិពណ៌នាអំពីបញ្ហា"}
            <textarea
              value={serviceCaseMessage}
              onChange={(event) =>
                onServiceCaseMessageChange(event.target.value)
              }
              maxLength={2000}
              rows={5}
            />
          </label>
        </div>
        <div className="support-card__actions">
          <button
            className="primary support-card__submit"
            disabled={loading || serviceCaseMessage.trim().length < 10}
            onClick={onSubmitServiceCase}
          >
            {language === "en"
              ? "Submit support case"
              : language === "zh-CN"
                ? "提交客服工单"
                : "ដាក់សំណើសេវាកម្ម"}
          </button>
          <button
            className="secondary support-card__history"
            disabled={loading || serviceCasesLoading}
            onClick={onLoadServiceCases}
          >
            {serviceCasesLoading
              ? "…"
              : language === "en"
                ? "View my case history"
                : language === "zh-CN"
                  ? "查看我的工单记录"
                  : "មើលប្រវត្តិសំណើរបស់ខ្ញុំ"}
          </button>
        </div>
        {serviceCaseNotice ? (
          <p className="response-note">{serviceCaseNotice}</p>
        ) : null}
        {serviceCasesLoaded ? (
          serviceCases.length === 0 ? (
            <p className="response-note">
              {language === "en"
                ? "No support cases recorded yet."
                : language === "zh-CN"
                  ? "暂无客服或投诉工单。"
                  : "មិនទាន់មានសំណើសេវាកម្ម ឬបណ្តឹងទេ។"}
            </p>
          ) : (
            <ul className="application-history">
              {serviceCases.map((serviceCase) => (
                <li key={serviceCase.caseNo}>
                  <strong>{serviceCase.caseNo}</strong>
                  <span>{serviceCaseLabel(serviceCase)}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </ProfilePage>
  );
}
