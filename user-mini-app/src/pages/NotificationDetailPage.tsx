import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  onBack?: () => void;
  children?: ReactNode;
}>;

export function NotificationDetailPage({
  language,
  onBack,
  children,
}: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].notificationDetail;
  return (
    <section
      className="page page--notification-detail"
      aria-labelledby="notification-detail-title"
    >
      <header className="page__header">
        <h2 id="notification-detail-title" className="page__title">
          {copy.title}
        </h2>
        {typeof onBack === "function" ? (
          <button
            type="button"
            className="secondary back-link"
            onClick={onBack}
            aria-label={copy.backHint}
          >
            {copy.backHint}
          </button>
        ) : null}
      </header>
      <div className="page__body" data-page-anchor="notification-detail">
        {children ?? (
          <div className="empty-state" role="status" aria-live="polite">
            {copy.empty}
          </div>
        )}
      </div>
    </section>
  );
}
