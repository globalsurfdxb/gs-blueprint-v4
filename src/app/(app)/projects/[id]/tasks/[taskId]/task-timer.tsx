import { formatDuration } from "@/lib/format";
import { LiveElapsed } from "@/components/live-elapsed";
import { ActionForm, SubmitButton } from "@/components/action-form";

export function TaskTimer({
  isRunning,
  closedSeconds,
  runningSinceIso,
  startAction,
  stopAction,
}: {
  isRunning: boolean;
  closedSeconds: number;
  runningSinceIso: string | null;
  startAction: (formData: FormData) => void;
  stopAction: (formData: FormData) => void;
}) {
  return (
    <div className="mt-8 flex items-center justify-between rounded-lg border border-gs-gray/15 bg-white p-4">
      <div>
        <p className="text-xs uppercase text-gs-gray">Total Logged</p>
        <p className="text-lg font-semibold">{formatDuration(closedSeconds)}</p>
        {isRunning && runningSinceIso && (
          <p className="mt-1 text-sm font-medium text-gs-red">
            Current session: <LiveElapsed startedAtIso={runningSinceIso} />
          </p>
        )}
      </div>
      <ActionForm
        action={isRunning ? stopAction : startAction}
        successMessage={isRunning ? "Timer stopped." : "Timer started."}
      >
        <SubmitButton
          pendingLabel={isRunning ? "Stopping…" : "Starting…"}
          className={`btn px-5 ${isRunning ? "btn-danger" : "btn-primary"}`}
        >
          {isRunning ? "Stop Timer" : "Start Timer"}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
