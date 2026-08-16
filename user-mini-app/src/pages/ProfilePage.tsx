import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  onLogout?: () => void;
  children?: ReactNode;
}>;

export function ProfilePage({
  language,
  onLogout,
  children,
}: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].profile;
  return (
    <section className="page page--profile" aria-labelledby="profile-title">
      <header className="page__header">
        <h2 id="profile-title" className="page__title">
          {copy.title}
        </h2>
      </header>
      <div className="page__body" data-page-anchor="profile">
        {children ?? (
          <>
            <dl className="profile-list" aria-label="Profile overview">
              <div>
                <dt>{copy.telegram}</dt>
                <dd aria-label={copy.telegram}>—</dd>
              </div>
              <div>
                <dt>{copy.phone}</dt>
                <dd aria-label={copy.phone}>—</dd>
              </div>
              <div>
                <dt>{copy.factory}</dt>
                <dd aria-label={copy.factory}>—</dd>
              </div>
              <div>
                <dt>{copy.language}</dt>
                <dd aria-label={copy.language}>—</dd>
              </div>
              <div>
                <dt>{copy.support}</dt>
                <dd aria-label={copy.support}>—</dd>
              </div>
            </dl>
            {typeof onLogout === "function" ? (
              <button
                type="button"
                className="secondary logout-button"
                onClick={onLogout}
                aria-label={copy.logout}
              >
                {copy.logout}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
