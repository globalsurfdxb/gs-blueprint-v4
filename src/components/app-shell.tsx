"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LogoutButton } from "@/components/logout-button";
import { NavIcon } from "@/components/nav-icons";
import { NavProgress } from "@/components/nav-progress";
import { ToastProvider } from "@/components/toast";
import type { NavItem } from "@/lib/nav";

type RunningTimer = {
  taskId: string;
  projectId: string;
  taskName: string;
  startedAtMs: number;
};

const COLLAPSE_KEY = "gs.sidebar.collapsed";
const COLLAPSE_EVENT = "gs:sidebar-collapsed";

// The sidebar's collapsed flag lives in localStorage (a per-browser preference), exposed to React
// as an external store so SSR renders expanded and the client picks up the saved choice on hydrate.
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false; // localStorage unavailable (private mode) — stay expanded.
  }
}
function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    // ignore — the toggle just won't persist
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

function elapsedLabel(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function RunningTimerPill({ timer }: { timer: RunningTimer }) {
  // Tick locally off the server-provided start time so the header stays live
  // without re-fetching. Seeds to 0 on first paint to avoid a hydration mismatch.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(Math.round((Date.now() - timer.startedAtMs) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timer.startedAtMs]);

  return (
    <Link
      href={`/projects/${timer.projectId}/tasks/${timer.taskId}`}
      title={`Timer running on "${timer.taskName}"`}
      className="flex h-10 items-center gap-1.5 rounded-full bg-gs-red/10 px-3 text-sm font-medium text-gs-red hover:bg-gs-red/15"
    >
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-gs-red" />
      <span className="tabular-nums">{elapsedLabel(elapsed)}</span>
      <span className="hidden max-w-[10rem] truncate lg:inline">{timer.taskName}</span>
    </Link>
  );
}

function Icon({ d, className }: { d: React.ReactNode; className?: string }) {
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
      {d}
    </svg>
  );
}

const ICONS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  chevron: <path d="M6 9l6 6 6-6" />,
  collapse: <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />,
};

/** A small popover menu: closes on outside click and Escape, so it behaves like the rest of the OS. */
function Menu({
  label,
  button,
  buttonClassName,
  children,
}: {
  label: string;
  button: React.ReactNode;
  buttonClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {button}
      </button>
      <div
        role="menu"
        aria-hidden={!open}
        inert={!open}
        onClick={() => setOpen(false)}
        className={`absolute right-0 z-30 mt-2 w-60 origin-top-right overflow-hidden rounded-lg border border-gs-gray/15 bg-white py-1 shadow-lg transition-[opacity,translate,scale,visibility] duration-150 ease-out ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "pointer-events-none invisible -translate-y-1 scale-95 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const MENU_ITEM = "flex min-h-10 w-full items-center px-4 text-left text-sm hover:bg-gs-light";

export function AppShell({
  navItems,
  quickCreateItems,
  userName,
  userEmail,
  unreadCount,
  runningTimer,
  children,
}: {
  navItems: NavItem[];
  quickCreateItems: NavItem[];
  userName: string;
  userEmail: string;
  unreadCount: number;
  runningTimer: RunningTimer | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The sidebar is a persistent column at tablet width and up (confirmed usable at
  // 768px); below that it would eat well over half the viewport, so it becomes an
  // off-canvas drawer opened via the header's menu button instead.
  const [navOpen, setNavOpen] = useState(false);
  // Desktop-only icon rail (the drawer is always full width). Remembered per browser.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  function toggleCollapsed() {
    writeCollapsed(!collapsed);
  }

  // Highlight the nav item that owns the current page — the LONGEST matching href, so
  // /projects/123 lights up Projects and /dependencies/tracker lights up Tracker (not also
  // /dependencies). The old exact-match left every detail/sub page with nothing highlighted.
  const activeHref = navItems
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Drawer: Escape closes it, and the page behind doesn't scroll while it's open.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [navOpen]);

  // Search is open to everyone; each role only finds what it can already see (see lib/search.ts).
  const hasSearch = true;

  // Press "/" anywhere (outside a text field) to jump to the search box — the usual power-user shortcut.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!hasSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasSearch]);
  const initial = userName.charAt(0).toUpperCase();

  return (
    <ToastProvider>
    <Suspense fallback={null}>
      <NavProgress />
    </Suspense>
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
    >
      Skip to content
    </a>
    <div className="flex min-h-screen">
      <button
        type="button"
        aria-label="Close navigation"
        aria-hidden={!navOpen}
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
        className={`fixed inset-0 z-30 bg-gs-black/50 transition-opacity duration-200 md:hidden ${
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-[#1d1e24] to-[#0f1013] text-white/70 transition-[transform,width] duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 ${
          collapsed ? "md:w-[4.5rem]" : "md:w-60"
        } ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`flex h-14 shrink-0 items-center px-5 ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          {/* Full GS Blueprint logo; the sidebar collapses to just the GS monogram. */}
          <Image
            src="/gs-blueprint-logo-light.svg"
            alt="GS Blueprint"
            width={171}
            height={28}
            priority
            unoptimized
            className={`h-7 w-auto ${collapsed ? "md:hidden" : ""}`}
          />
          <Image
            src="/gs-icon-light.svg"
            alt="GS"
            width={46}
            height={28}
            priority
            unoptimized
            className={`hidden h-7 w-auto ${collapsed ? "md:block" : ""}`}
          />
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-1">
          {navItems.map((item, i) => {
            const active = item.href === activeHref;
            const startsSection = item.section && item.section !== navItems[i - 1]?.section;
            return (
              <div key={item.href} className="contents">
                {startsSection &&
                  (collapsed ? (
                    <hr className="my-3 hidden border-white/10 md:block" />
                  ) : null)}
                {startsSection && (
                  <p
                    className={`mt-5 px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    {item.section}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex min-h-10 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors ${
                    collapsed ? "md:justify-center md:px-0" : ""
                  } ${
                    active
                      ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                      : "hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <span aria-hidden className="absolute inset-y-2.5 -left-3 w-1 rounded-r-full bg-gs-red" />
                  )}
                  <NavIcon href={item.href} className="h-5 w-5 shrink-0" />
                  <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <Link
          href="/profile"
          onClick={() => setNavOpen(false)}
          title={collapsed ? userName : undefined}
          className={`mx-3 mb-2 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.08] ${
            collapsed ? "md:justify-center md:border-transparent md:bg-transparent md:p-1.5" : ""
          }`}
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gs-red text-sm font-semibold text-white"
          >
            {initial}
          </span>
          <span className={`min-w-0 ${collapsed ? "md:sr-only" : ""}`}>
            <span className="block truncate text-[13px] font-medium text-white">{userName}</span>
            <span className="block truncate text-[11px] text-white/45">{userEmail}</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          className={`mx-3 mb-3 hidden min-h-10 items-center gap-3 rounded-md px-3 text-sm text-white/50 hover:bg-white/5 hover:text-white md:flex ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <Icon d={ICONS.collapse} className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          <span className={collapsed ? "sr-only" : ""}>Collapse</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-gs-gray/15 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gs-black hover:bg-gs-light md:hidden"
            >
              <Icon d={ICONS.menu} className="h-5 w-5" />
            </button>
            {hasSearch && (
              <form action="/search" role="search" className="relative hidden w-full max-w-md md:block">
                <Icon d={ICONS.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gs-gray" />
                <input
                  ref={searchRef}
                  type="search"
                  name="q"
                  aria-label="Search projects and tasks"
                  placeholder="Search projects and tasks"
                  className="peer h-10 w-full rounded-lg border border-transparent bg-gs-light pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-gs-gray focus:border-gs-gray/30 focus:bg-white focus:shadow-[0_0_0_3px_rgba(230,62,49,0.12)]"
                />
                <kbd
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gs-gray/25 bg-white px-1.5 text-[11px] font-medium leading-5 text-gs-gray peer-focus:hidden"
                >
                  /
                </kbd>
              </form>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {runningTimer && <RunningTimerPill timer={runningTimer} />}

            {hasSearch && (
              <Link
                href="/search"
                aria-label="Search"
                className="flex h-10 w-10 items-center justify-center rounded-md text-gs-gray hover:bg-gs-light hover:text-gs-black md:hidden"
              >
                <Icon d={ICONS.search} className="h-5 w-5" />
              </Link>
            )}

            {quickCreateItems.length > 0 && (
              <Menu
                label="Create new"
                buttonClassName="btn btn-primary gap-1.5 px-3 sm:px-4"
                button={
                  <>
                    <Icon d={ICONS.plus} className="h-4 w-4" />
                    <span className="hidden sm:inline">New</span>
                  </>
                }
              >
                {quickCreateItems.map((q) => (
                  <Link key={q.href} href={q.href} role="menuitem" className={MENU_ITEM}>
                    {q.label}
                  </Link>
                ))}
              </Menu>
            )}

            <Link
              href="/notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              className={`relative flex h-10 w-10 items-center justify-center rounded-md text-gs-gray hover:bg-gs-light hover:text-gs-black ${
                pathname === "/notifications" ? "bg-gs-light text-gs-black" : ""
              }`}
            >
              <Icon d={ICONS.bell} className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gs-red px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <Menu
              label="Account menu"
              buttonClassName="flex h-10 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-gs-light"
              button={
                <>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gs-red/10 text-sm font-semibold text-gs-red"
                  >
                    {initial}
                  </span>
                  <Icon d={ICONS.chevron} className="hidden h-4 w-4 text-gs-gray sm:block" />
                </>
              }
            >
              <div className="border-b border-gs-gray/10 px-4 py-3">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-gs-gray">{userEmail}</p>
              </div>
              <Link href="/profile" role="menuitem" className={MENU_ITEM}>
                Your profile
              </Link>
              <LogoutButton className={`${MENU_ITEM} text-gs-red`} />
            </Menu>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 bg-gs-light p-4 outline-none md:p-6 xl:p-8">
          {/* Wide enough for dense dashboards on large monitors, centred so ultra-wide screens
              don't push content to one edge. Pages may still cap themselves narrower (forms). */}
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
