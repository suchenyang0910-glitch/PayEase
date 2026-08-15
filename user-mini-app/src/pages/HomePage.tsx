import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { USER_SKELETON_COPY } from "../copy/user-copy.ts";

type Props = Readonly<{
  language: LanguageCode;
  children?: ReactNode;
}>;

export function HomePage({ language, children }: Props): JSX.Element {
  const copy = USER_SKELETON_COPY[language].home;
  return (
    <section className="page page--home" aria-labelledby="home-title">
      <header className="page__header">
        <h2 id="home-title" className="page__title">
          {copy.title}
        </h2>
        <p className="page__subtitle">{copy.subtitle}</p>
      </header>
      <div className="page__body" data-page-anchor="home">
        {children}
      </div>
    </section>
  );
}
