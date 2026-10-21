"use client";

import { useRouter } from "next/navigation";

/**
 * A sprint row that opens the sprint when you click ANYWHERE on it (not just the title): the whole
 * row is the target, with a pointer cursor, a hover highlight, a trailing chevron and keyboard
 * support (Tab to it, Enter / Space to open).
 */
export function SprintLinkRow({
  href,
  label,
  children,
}: {
  href: string;
  /** Accessible name, e.g. "Open Sprint 1". */
  label: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const open = () => router.push(href);

  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onMouseEnter={() => router.prefetch(href)}
      className="group cursor-pointer border-t border-gs-gray/10 transition-colors hover:bg-gs-red/[0.04] focus-visible:bg-gs-red/[0.06]"
    >
      {children}
      <td className="w-8 pr-4 text-right align-middle" aria-hidden>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="inline h-4 w-4 text-gs-gray/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gs-red"
        >
          <path d="M8 5l5 5-5 5" />
        </svg>
      </td>
    </tr>
  );
}
