"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";

/** Errors Next.js throws for control flow (redirect / notFound) must propagate, not be
 * swallowed and shown as a toast. */
function isControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: string })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

/**
 * A <form> whose server action is wrapped so that, on success, it fires a confirmation
 * toast (PRD 8.2.3) and optionally runs onSuccess (e.g. to close an inline editor). On
 * failure it toasts the error. Submit buttons inside pick up the pending state via
 * useFormStatus, which also disables them against double-submits (PRD 8.2.3 data-integrity).
 */
export function ActionForm({
  action,
  successMessage,
  onSuccess,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  successMessage: string;
  onSuccess?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const { addToast } = useToast();
  // React 19 resets an uncontrolled form once its action settles — including when the action
  // failed, which would wipe everything the user typed just because one field was invalid.
  // On a failure we cancel that one automatic reset (it's a cancelable native `reset` event).
  const keepFieldsOnce = useRef(false);

  async function clientAction(formData: FormData) {
    try {
      await action(formData);
    } catch (err) {
      if (isControlFlowError(err)) throw err; // let redirect/notFound do their job
      keepFieldsOnce.current = true;
      addToast(err instanceof Error && err.message ? err.message : "Something went wrong.", "error");
      return;
    }
    addToast(successMessage, "success");
    onSuccess?.();
  }

  return (
    <form
      action={clientAction}
      onReset={(e) => {
        if (keepFieldsOnce.current) {
          keepFieldsOnce.current = false;
          e.preventDefault();
        }
      }}
      className={className}
    >
      {children}
    </form>
  );
}

/**
 * Submit button that disables itself the instant the form is submitting and re-enables
 * only once the server responds — the double-click / slow-connection guard from PRD 8.2.3.
 * Must be rendered inside a <form> (ActionForm or a plain server-action form).
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:opacity-60`}
    >
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
