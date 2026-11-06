import type { ReactNode } from "react";

export type AdminIconName =
  | "dashboard"
  | "stores"
  | "branding"
  | "integrations"
  | "orders"
  | "sync"
  | "team"
  | "settings"
  | "menu"
  | "calendar"
  | "store"
  | "cart"
  | "link"
  | "card"
  | "arrowUp"
  | "chevron"
  | "logout"
  | "user";

export default function AdminIcon({
  name,
  className = "h-5 w-5",
}: {
  name: AdminIconName;
  className?: string;
}) {
  const paths: Record<AdminIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    stores: (
      <>
        <path d="M4 10h16v10H4z" />
        <path d="M3 10 5 4h14l2 6M8 14h3v6H8z" />
      </>
    ),
    branding: (
      <>
        <path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </>
    ),
    integrations: (
      <>
        <circle cx="7" cy="12" r="3" />
        <circle cx="17" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
        <path d="m9.5 10.5 5-2M9.5 13.5l5 2" />
      </>
    ),
    orders: (
      <>
        <path d="M6 7h14l-1.5 7h-10z" />
        <path d="M6 7 5 3H2M9 19a1 1 0 1 0 0 .01M18 19a1 1 0 1 0 0 .01" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.2 9A7 7 0 0 1 20 12M17.8 15A7 7 0 0 1 4 12" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.1 1z" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    store: (
      <>
        <path d="M4 10h16v10H4z" />
        <path d="M3 10 5 4h14l2 6M8 14h3v6H8z" />
      </>
    ),
    cart: (
      <>
        <path d="M6 7h14l-1.5 7h-10z" />
        <path d="M6 7 5 3H2M9 19a1 1 0 1 0 0 .01M18 19a1 1 0 1 0 0 .01" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
      </>
    ),
    card: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    arrowUp: (
      <>
        <path d="M12 19V5M6 11l6-6 6 6" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
