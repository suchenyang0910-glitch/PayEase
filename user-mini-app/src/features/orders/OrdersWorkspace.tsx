import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import type { ApplicationHistoryEntry } from "../../application-history.ts";
import { formatUsdMinor } from "../../format-usd-minor.ts";
import { OrdersPage } from "../../pages/OrdersPage.tsx";

type OrdersView = "borrow" | "records" | "reassessment";
type RecordFilter =
  "ALL" | "IN_REVIEW" | "PENDING_CONTRACT" | "ACTIVE" | "SETTLED" | "CLOSED";

type HistoryFilter = Readonly<{
  key: RecordFilter;
  label: string;
}>;

type ReassessmentRequest = Readonly<{
  requestNo?: string;
  submittedAt?: string;
}>;

type OrdersWorkspaceProps = Readonly<{
  language: LanguageCode;
  empty: boolean;
  onOpenFirst: () => void;
  currentStep: number;
  reviewLabel: string;
  securedLabel: string;
  progressLabels: readonly string[];
  ordersView: OrdersView;
  onSelectOrdersView: (view: OrdersView) => void;
  pageBody: ReactNode;
  filteredHistory: readonly ApplicationHistoryEntry[];
  historyFilters: readonly HistoryFilter[];
  recordFilter: RecordFilter;
  onRecordFilterChange: (filter: RecordFilter) => void;
  onOpenHistoryItem: (applicationNo: string) => Promise<void> | void;
  result: string;
  wealthProofAttached: boolean;
  employerTenantId: string;
  reassessmentSubmitted: boolean;
  reassessmentRequest?: ReassessmentRequest | null;
  canRequestReassessment: boolean;
  onSubmitReassessmentRequest: () => void;
  displayDate: (value: string | null | undefined) => string;
  maskApplicationNo: (value: string) => string;
  phaseLabelForStatus: (status: string) => string;
  historyActionLabelForStatus: (status: string) => string;
}>;

function recordsTitle(language: LanguageCode): string {
  if (language === "zh-CN") return "借款记录";
  if (language === "km") return "ប្រវត្តិប្រាក់កម្ចី";
  return "Loan records";
}

function ordersViewLabel(language: LanguageCode, view: OrdersView): string {
  if (view === "borrow") {
    if (language === "zh-CN") return "我要借款";
    if (language === "km") return "ខ្ចីប្រាក់";
    return "Borrow";
  }
  if (view === "records") {
    if (language === "zh-CN") return "借款记录";
    if (language === "km") return "ប្រវត្តិ";
    return "Records";
  }
  if (language === "zh-CN") return "重新评估";
  if (language === "km") return "វាយតម្លៃឡើងវិញ";
  return "Reassessment";
}

function recordLead(language: LanguageCode): string {
  if (language === "zh-CN") return "这里只展示申请编号、阶段、金额与日期。";
  if (language === "km") {
    return "នៅទីនេះបង្ហាញតែលេខពាក្យសុំ ដំណាក់កាល ចំនួនទឹកប្រាក់ និងកាលបរិច្ឆេទប៉ុណ្ណោះ។";
  }
  return "Only the application number, stage, amount, and date are shown here.";
}

function recordFilterTitle(language: LanguageCode): string {
  if (language === "zh-CN") return "按阶段筛选";
  if (language === "km") return "ត្រងតាមដំណាក់កាល";
  return "Filter by stage";
}

function recordEmptyLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "当前筛选下暂无记录。";
  if (language === "km") return "មិនមានកំណត់ត្រាត្រូវនឹងតម្រងនេះទេ។";
  return "No records match this filter.";
}

function daysLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "天";
  if (language === "km") return "ថ្ងៃ";
  return "days";
}

function reassessmentTitle(language: LanguageCode): string {
  if (language === "zh-CN") return "额度重新评估";
  if (language === "km") return "ការវាយតម្លៃឥណទានឡើងវិញ";
  return "Credit reassessment";
}

function reassessmentLead(language: LanguageCode, result: string): string {
  if (result === "repayment-active" || result === "funded") {
    if (language === "zh-CN")
      return "请先完成当前订单，或等待重新评估条件满足。";
    if (language === "km") {
      return "សូមបំពេញការបញ្ជាទិញបច្ចុប្បន្នជាមុន ឬរង់ចាំឱ្យលក្ខខណ្ឌវាយតម្លៃឡើងវិញបានបំពេញ។";
    }
    return "Please complete the current order or wait until reassessment conditions are met.";
  }
  if (result === "reviewing") {
    if (language === "zh-CN")
      return "请先等待当前申请审核完成，再发起重新评估。";
    if (language === "km") {
      return "សូមរង់ចាំការពិនិត្យពាក្យសុំបច្ចុប្បន្នបញ្ចប់សិន មុនស្នើសុំវាយតម្លៃឡើងវិញ។";
    }
    return "Finish the current application review before requesting a reassessment.";
  }
  if (language === "zh-CN")
    return "你可以补充资料申请重新评估，结果仍以审核为准。";
  if (language === "km") {
    return "អ្នកអាចបន្ថែមព័ត៌មានគាំទ្រ ដើម្បីស្នើសុំវាយតម្លៃឡើងវិញ ហើយលទ្ធផលនៅតែអាស្រ័យលើការពិនិត្យ។";
  }
  return "You may submit updated supporting details for a reassessment. Approval is not guaranteed.";
}

function reassessmentMaterialsTitle(language: LanguageCode): string {
  if (language === "zh-CN") return "可补充资料";
  if (language === "km") return "ឯកសារគាំទ្រ";
  return "Supporting details";
}

function reassessmentAddressLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "更新住址";
  if (language === "km") return "ធ្វើបច្ចុប្បន្នភាពអាសយដ្ឋាន";
  return "Update address";
}

function reassessmentWealthLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "收入 / 财力证明（可选）";
  if (language === "km") return "ភស្តុតាងចំណូល / ទ្រព្យសម្បត្តិ (ស្រេចចិត្ត)";
  return "Income / wealth proof (optional)";
}

function reassessmentEmployerLabel(language: LanguageCode): string {
  if (language === "zh-CN") return "企业信息";
  if (language === "km") return "ព័ត៌មានក្រុមហ៊ុន";
  return "Employer information";
}

function reassessmentSubmittedCopy(
  language: LanguageCode,
  requestNo: string,
  submittedAt: string,
): string {
  const date = submittedAt;
  if (language === "zh-CN") {
    return `重新评估申请 ${requestNo} 已于 ${date} 提交，请等待审核。`;
  }
  if (language === "km") {
    return `សំណើវាយតម្លៃឡើងវិញ ${requestNo} ត្រូវបានដាក់ស្នើនៅ ${date} សូមរង់ចាំការពិនិត្យ។`;
  }
  return `Reassessment ${requestNo} submitted on ${date}. Please wait for review.`;
}

function reassessmentSubmitButton(language: LanguageCode): string {
  if (language === "zh-CN") return "提交重新评估申请";
  if (language === "km") return "ដាក់សំណើវាយតម្លៃឡើងវិញ";
  return "Submit reassessment request";
}

function reassessmentAvailability(language: LanguageCode): string {
  if (language === "zh-CN") {
    return "重新评估仅在当前案件已关闭、结清或正式拒绝后开放。";
  }
  if (language === "km") {
    return "ការវាយតម្លៃឡើងវិញ អាចស្នើបាន លុះត្រាតែករណីបច្ចុប្បន្នត្រូវបានបិទ បិទបញ្ចប់ ឬបដិសេធជាផ្លូវការ។";
  }
  return "Reassessment becomes available only after the current case is closed, settled, or formally declined.";
}

export function OrdersWorkspace({
  language,
  empty,
  onOpenFirst,
  currentStep,
  reviewLabel,
  securedLabel,
  progressLabels,
  ordersView,
  onSelectOrdersView,
  pageBody,
  filteredHistory,
  historyFilters,
  recordFilter,
  onRecordFilterChange,
  onOpenHistoryItem,
  result,
  wealthProofAttached,
  employerTenantId,
  reassessmentSubmitted,
  reassessmentRequest,
  canRequestReassessment,
  onSubmitReassessmentRequest,
  displayDate,
  maskApplicationNo,
  phaseLabelForStatus,
  historyActionLabelForStatus,
}: OrdersWorkspaceProps): JSX.Element {
  return (
    <OrdersPage language={language} empty={empty} onOpenFirst={onOpenFirst}>
      <section className="progress-card">
        <div className="progress-title">
          <span>{reviewLabel}</span>
          <small>{securedLabel}</small>
        </div>
        <div className="progress">
          {progressLabels.map((label, index) => (
            <div
              className={`progress-step ${index < currentStep ? "done" : index === currentStep ? "active" : ""}`}
              key={`${label}-${index}`}
            >
              <i>{index < currentStep ? "✓" : index + 1}</i>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="orders-view-switch" aria-label="Borrow workspace">
        {(["borrow", "records", "reassessment"] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={ordersView === view ? "secondary selected" : "secondary"}
            onClick={() => onSelectOrdersView(view)}
          >
            {ordersViewLabel(language, view)}
          </button>
        ))}
      </section>

      {ordersView === "borrow" ? (
        pageBody
      ) : ordersView === "records" ? (
        <section className="records-board" aria-label="Loan records">
          <div className="records-board__header">
            <div className="progress-title">
              <span>{recordsTitle(language)}</span>
              <small>{filteredHistory.length}</small>
            </div>
            <p className="response-note records-board__lead">
              {recordLead(language)}
            </p>
          </div>
          <section
            className="records-board__filters"
            aria-label="Record filters"
          >
            <strong className="records-board__section-title">
              {recordFilterTitle(language)}
            </strong>
            <div className="history-filters">
              {historyFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={
                    recordFilter === filter.key
                      ? "secondary selected"
                      : "secondary"
                  }
                  onClick={() => onRecordFilterChange(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>
          {filteredHistory.length === 0 ? (
            <div className="records-board__empty">
              <p className="response-note records-board__empty-note">
                {recordEmptyLabel(language)}
              </p>
            </div>
          ) : (
            <div className="record-cards records-board__content">
              {filteredHistory.map((item) => (
                <button
                  key={item.applicationNo}
                  type="button"
                  className="record-card"
                  onClick={() => void onOpenHistoryItem(item.applicationNo)}
                >
                  <div className="record-card__head">
                    <strong>{maskApplicationNo(item.applicationNo)}</strong>
                    <span>{phaseLabelForStatus(item.status)}</span>
                  </div>
                  <div className="record-card__meta">
                    <span>{item.createdAt?.slice(0, 10) ?? "—"}</span>
                    <span>
                      {item.approvedAmountMinor
                        ? formatUsdMinor(item.approvedAmountMinor)
                        : formatUsdMinor(item.requestedAmountMinor)}
                    </span>
                    <span>
                      {item.tenorDays} {daysLabel(language)}
                    </span>
                  </div>
                  <small>{historyActionLabelForStatus(item.status)}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="reassessment-card" aria-label="Reassessment">
          <div className="reassessment-card__header">
            <div className="progress-title">
              <span>{reassessmentTitle(language)}</span>
            </div>
            <p className="response-note reassessment-card__lead">
              {reassessmentLead(language, result)}
            </p>
          </div>
          <section
            className="reassessment-card__materials"
            aria-label="Reassessment materials"
          >
            <strong className="reassessment-card__section-title">
              {reassessmentMaterialsTitle(language)}
            </strong>
            <div className="reassessment-items">
              <label className="consent reassessment-item">
                <input type="checkbox" checked readOnly />
                <span>{reassessmentAddressLabel(language)}</span>
              </label>
              <label className="consent reassessment-item">
                <input type="checkbox" checked={wealthProofAttached} readOnly />
                <span>{reassessmentWealthLabel(language)}</span>
              </label>
              <label className="consent reassessment-item">
                <input
                  type="checkbox"
                  checked={Boolean(employerTenantId)}
                  readOnly
                />
                <span>{reassessmentEmployerLabel(language)}</span>
              </label>
            </div>
          </section>
          <div className="reassessment-card__footer">
            {reassessmentSubmitted ? (
              <p className="response-note reassessment-card__status">
                {reassessmentSubmittedCopy(
                  language,
                  reassessmentRequest?.requestNo ?? "",
                  displayDate(reassessmentRequest?.submittedAt),
                )}
              </p>
            ) : (
              <button
                type="button"
                className="primary reassessment-card__action"
                onClick={onSubmitReassessmentRequest}
                disabled={!canRequestReassessment}
              >
                {reassessmentSubmitButton(language)}
              </button>
            )}
            {!canRequestReassessment && !reassessmentSubmitted ? (
              <p className="response-note reassessment-card__availability">
                {reassessmentAvailability(language)}
              </p>
            ) : null}
          </div>
        </section>
      )}
    </OrdersPage>
  );
}
