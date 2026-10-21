import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";

export function AssignTaskForm({
  assignees,
  action,
}: {
  assignees: { id: string; name: string }[];
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm
      action={action}
      successMessage="Task assigned."
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gs-gray/15 bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Assign To</label>
        <Select name="assignedToId" required defaultValue="" className="field">
          <option value="" disabled>Select one person</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </div>
      <SubmitButton
        pendingLabel="Assigning…"
        className="btn btn-primary"
      >
        Assign
      </SubmitButton>
      <p className="w-full text-xs text-gs-gray">
        This task was handed off unassigned — assign it to a member of your group to start work.
      </p>
    </ActionForm>
  );
}
