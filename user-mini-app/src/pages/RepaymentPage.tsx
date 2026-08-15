import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  empty?: boolean;
  onContactSupport?: () => void;
}>;

export function RepaymentPage({
  language,
  empty = false,
  onContactSupport,
}: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].repayment;
  return (
    <section className="page page--repayment" aria-labelledby="repayment-title">
      <header className="page__header">
        <h2 id="repayment-title" className="page__title">
          {copy.title}
        </h2>
        <p className="page__hint">{copy.manualNotice}</p>
      </header>
      <div className="page__body" data-page-anchor="repayment">
        {empty ? (
          <div className="empty-state" role="status" aria-live="polite">
            {copy.empty}
            {typeof onContactSupport === "function" ? (
              <button
                type="button"
                className="secondary"
                onClick={onContactSupport}
                aria-label={copy.support}
              >
                {copy.support}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
