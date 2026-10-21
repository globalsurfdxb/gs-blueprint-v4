// Stroke icons (24px grid, Feather-style) for the sidebar. Keyed by nav href so the NavItem
// model in lib/nav.ts stays plain data — an unknown href falls back to a neutral dot.

const PATHS: Record<string, React.ReactNode> = {
  "/": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  "/projects": <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  "/my-tasks": (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  "/my-reviews": (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "/reports": (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  "/search": (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  "/content-calendar": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  "/clients": (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "/dependencies": (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5V12a4 4 0 0 0 4 4h5.5" />
    </>
  ),
  "/admin/users": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  "/bugs": (
    <>
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M8 10H4M8 14H4M16 10h4M16 14h4M9 3l1.5 2M15 3l-1.5 2" />
    </>
  ),
  "/sprints": <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  "/admin/industries": (
    <>
      <path d="M3 21V9l6 3V9l6 3V4h6v17z" />
      <path d="M3 21h18" />
    </>
  ),
  "/admin/content-types": (
    <>
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  "/admin/bug-tracking": (
    <>
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M8 10H4M8 14H4M16 10h4M16 14h4M9 3l1.5 2M15 3l-1.5 2" />
    </>
  ),
  "/admin/content-body": (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h8" />
    </>
  ),
  "/admin/sprint-workflow": <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
};

export function NavIcon({ href, className }: { href: string; className?: string }) {
  // Longest matching key wins, so /admin/users doesn't fall through to anything shorter.
  const key = Object.keys(PATHS)
    .filter((k) => (k === "/" ? href === "/" : href === k || href.startsWith(`${k}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {key ? PATHS[key] : <circle cx="12" cy="12" r="2" />}
    </svg>
  );
}
