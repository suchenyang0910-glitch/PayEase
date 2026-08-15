import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  empty?: boolean;
  onOpenFirst?: () => void;
}>;

export function OrdersPage({
  language,
  empty = false,
  onOpenFirst,
}: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].orders;
  return (
    <section className="page page--orders" aria-labelledby="orders-title">
      <header className="page__header">
        <h2 id="orders-title" className="page__title">
          {copy.title}
        </h2>
        <p className="page__hint">{copy.listHint}</p>
      </header>
      <div className="page__body" data-page-anchor="orders">
        {empty ? (
          <div className="empty-state" role="status" aria-live="polite">
            {copy.empty}
          </div>
        ) : typeof onOpenFirst === "function" ? (
          <button
            type="button"
            className="secondary"
            onClick={onOpenFirst}
            aria-label={copy.openDetail}
          >
            {copy.openDetail}
          </button>
        ) : null}
      </div>
    </section>
  );
}
