import { SaveButton } from "@/components/save-button";
import { ActionForm } from "@/components/action-form";

type Defaults = { name: string; contentLeadTimeDays: number; designLeadTimeDays: number };

export function EditContentTypeForm({
  defaults,
  action,
}: {
  defaults: Defaults;
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gs-gray">Name</span>
        <input
          name="name"
          required
          defaultValue={defaults.name}
          className="field"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gs-gray">Content Lead Time (days)</span>
        <input
          name="contentLeadTimeDays"
          type="number"
          min="0"
          required
          defaultValue={defaults.contentLeadTimeDays}
          className="field w-28"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gs-gray">Design Lead Time (days)</span>
        <input
          name="designLeadTimeDays"
          type="number"
          min="0"
          required
          defaultValue={defaults.designLeadTimeDays}
          className="field w-28"
        />
      </label>
      <SaveButton className="btn btn-secondary">
        Save
      </SaveButton>
    </ActionForm>
  );
}
