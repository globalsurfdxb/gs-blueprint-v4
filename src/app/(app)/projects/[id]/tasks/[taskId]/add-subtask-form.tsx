import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";

export function AddSubtaskForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <ActionForm
      action={action}
      successMessage="Subtask added."
      className="flex flex-wrap items-end gap-3 rounded-lg border border-gs-gray/15 bg-white p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Subtask Name</label>
        <input
          name="name"
          required
          className="field"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Priority</label>
        <Select name="priority" defaultValue="MEDIUM" className="field">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Due Date</label>
        <input name="dueDate" type="date" required className="field" />
      </div>
      <SubmitButton
        pendingLabel="Adding…"
        className="btn btn-secondary"
      >
        Add Subtask
      </SubmitButton>
    </ActionForm>
  );
}
