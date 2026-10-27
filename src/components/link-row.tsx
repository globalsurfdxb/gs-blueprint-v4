"use client";

import { useRouter } from "next/navigation";

/** Anything inside a row that already does something when clicked — the row must not also navigate. */
const INTERACTIVE = "a,button,input,select,textarea,label,summary,[role=button]:not(tr)";

/**
 * A table row that opens `href` when you click ANYWHERE on it, not just on the name link: pointer cursor,
 * hover highlight and keyboard support (Tab to the row, Enter / Space). Ctrl/Cmd-click opens a new tab.
 * Real controls inside the row (the name link, buttons) keep working on their own.
 */
export function LinkRow({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const open = (newTab: boolean) => (newTab ? window.open(href, "_blank", "noopener") : router.push(href));

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        open(e.metaKey || e.ctrlKey);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // keys typed inside the row's own controls stay theirs
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(false);
        }
      }}
      className={`cursor-pointer transition-colors hover:bg-gs-red/[0.04] focus-visible:bg-gs-red/[0.06] ${className}`}
    >
      {children}
    </tr>
  );
}
