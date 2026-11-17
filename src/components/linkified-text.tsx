import { Fragment } from "react";

// http(s):// or www. addresses. Trailing punctuation (a full stop or bracket right after the link) isn't part of it.
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"]*[^\s<>"'.,;:!?)\]}])/gi;

/**
 * Plain text where every web address is a clickable link (opens in a new tab). Line breaks are kept, and long
 * words or addresses wrap inside the box instead of running out of it.
 */
export function LinkifiedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <span className={`block min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => {
        // split() with a capture group puts the matched addresses at the odd positions.
        if (i % 2 === 1) {
          const href = /^www\./i.test(part) ? `https://${part}` : part;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gs-red underline decoration-gs-red/40 underline-offset-2 hover:decoration-gs-red"
            >
              {part}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
