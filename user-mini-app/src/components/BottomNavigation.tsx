import type { ReactNode } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import {
  USER_SKELETON_COPY,
  USER_TABS,
  type UserTab,
} from "../copy/user-copy.ts";

type Props = Readonly<{
  current: UserTab;
  language: LanguageCode;
  onChange: (next: UserTab) => void;
}>;

function TabItem({
  active,
  onClick,
  label,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  label: string;
}>): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={
        active
          ? "bottom-nav__item bottom-nav__item--active"
          : "bottom-nav__item"
      }
    >
      {label}
    </button>
  );
}

export function BottomNavigation({
  current,
  language,
  onChange,
}: Props): ReactNode {
  const copy = USER_SKELETON_COPY[language];
  if (current === "order-detail") {
    return (
      <nav
        className="bottom-nav bottom-nav--detail"
        aria-label="Application detail navigation"
      >
        <button
          type="button"
          role="link"
          onClick={() => onChange("orders")}
          className="bottom-nav__back"
        >
          {copy.backToOrders}
        </button>
      </nav>
    );
  }
  return (
    <nav className="bottom-nav" aria-label="Primary tabs" role="tablist">
      {USER_TABS.map((tab) => (
        <TabItem
          key={tab}
          active={current === tab}
          label={copy.tabs[tab]}
          onClick={() => onChange(tab)}
        />
      ))}
    </nav>
  );
}
