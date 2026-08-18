import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  children?: ReactNode;
  empty?: boolean;
  onOpenFirst?: () => void;
  entryStatusLabel?: string;
  entryTitle?: string;
  entryDescription?: string;
  entryActionLabel?: string;
  onEntryAction?: () => void;
}>;

export function OrdersPage({
  language,
  children,
  empty = false,
  onOpenFirst,
  entryStatusLabel,
  entryTitle,
  entryDescription,
  entryActionLabel,
  onEntryAction,
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
        {entryTitle ? (
          <section className="borrow-entry-card" aria-label="Borrow entry">
            {entryStatusLabel ? (
              <p className="borrow-entry-card__status">{entryStatusLabel}</p>
            ) : null}
            <h3 className="borrow-entry-card__title">{entryTitle}</h3>
            {entryDescription ? (
              <p className="borrow-entry-card__description">
                {entryDescription}
              </p>
            ) : null}
            {entryActionLabel && typeof onEntryAction === "function" ? (
              <button
                type="button"
                className="primary borrow-entry-card__action"
                onClick={onEntryAction}
              >
                {entryActionLabel}
              </button>
            ) : null}
          </section>
        ) : null}
        {children}
        {empty ? (
          <div className="empty-state" role="status" aria-live="polite">
            {copy.empty}
          </div>
        ) : !entryActionLabel && typeof onOpenFirst === "function" ? (
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
