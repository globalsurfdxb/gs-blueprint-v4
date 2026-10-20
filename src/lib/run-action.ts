import { unstable_rethrow } from "next/navigation";
import { GENERIC_ERROR, type ActionFailure } from "@/lib/action-result";

/**
 * Wrap the body of a server action so expected failures come back to the browser as data.
 *
 *  - `redirect()` / `notFound()` and other framework control-flow errors are re-thrown untouched.
 *  - A plain `throw new Error("…")` is one of OUR deliberate, user-facing messages ("Only the
 *    assignee can start this task.") → returned as `{ ok: false, error }` so production shows it.
 *  - Anything else (a Prisma/DB error, a bug) is logged on the server and replaced by a generic
 *    message, so internals never leak to the browser.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Error && e.constructor === Error) return { ok: false, error: e.message };
    console.error("[server action failed]", e);
    return { ok: false, error: GENERIC_ERROR };
  }
}
