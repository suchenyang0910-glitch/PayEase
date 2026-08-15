import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  applicationNo?: string | null;
  onBack?: () => void;
}>;

export function OrderDetailPage({
  language,
  applicationNo,
  onBack,
}: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].orderDetail;
  return (
    <section
      className="page page--order-detail"
      aria-labelledby="order-detail-title"
    >
      <header className="page__header">
        <h2 id="order-detail-title" className="page__title">
          {copy.title}
        </h2>
        <p className="page__hint">
          {copy.backHint}
          {applicationNo ? ` · ${applicationNo}` : ""}
        </p>
        {typeof onBack === "function" ? (
          <button
            type="button"
            className="secondary back-link"
            onClick={onBack}
            aria-label={USER_SKELETON_COPY[language].backToOrders}
          >
            {USER_SKELETON_COPY[language].backToOrders}
          </button>
        ) : null}
      </header>
      <div className="page__body" data-page-anchor="order-detail">
        <div className="empty-state" role="status" aria-live="polite">
          {copy.empty}
        </div>
      </div>
    </section>
  );
}
