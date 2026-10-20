// Shared (client + server safe) shape for the outcome of a server action.
//
// WHY THIS EXISTS: in a production build Next.js replaces the message of any error thrown from a
// server action with a generic "An error occurred in the Server Components render…" text, so a
// user who simply isn't allowed to do something saw a technical, useless message (QA A-01 / E-02).
// Actions therefore RETURN expected failures as `{ ok: false, error }` (see run-action.ts) and the UI
// shows `error` as a plain-language toast.

export type ActionFailure = { ok: false; error: string };

/** Optional success payload: `notice` is shown as an extra toast (e.g. "Timer stopped for: …"). */
export type ActionSuccess = { ok: true; notice?: string };

export const GENERIC_ERROR = "Something went wrong. Please try again.";

export function isFailure(result: unknown): result is ActionFailure {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok === false &&
    typeof (result as { error?: unknown }).error === "string"
  );
}

export function noticeOf(result: unknown): string | null {
  if (typeof result === "object" && result !== null) {
    const n = (result as { notice?: unknown }).notice;
    if (typeof n === "string" && n) return n;
  }
  return null;
}

/** Turn an exception that reached the client (network drop, or a message Next.js masked) into
 * something a person can act on. */
export function readableError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (!message || /Server Components render|omitted in production/i.test(message)) return GENERIC_ERROR;
  return message;
}
