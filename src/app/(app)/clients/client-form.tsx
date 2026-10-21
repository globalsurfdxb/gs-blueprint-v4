import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SaveButton } from "@/components/save-button";
import { Select } from "@/components/select";

type ClientDefaults = {
  name?: string;
  industry?: string | null;
};

/**
 * The Client form is deliberately just two fields: the client's name and an Industry chosen from
 * the Admin-managed list (Admin → Industries). A client whose stored industry is no longer in the
 * list still shows it as the current choice, so opening and saving them never silently blanks it.
 */
export function ClientForm({
  action,
  industries,
  defaults,
  submitLabel,
  successMessage = "Saved.",
  canManageIndustries = false,
}: {
  action: (formData: FormData) => void;
  industries: string[];
  defaults?: ClientDefaults;
  submitLabel: string;
  successMessage?: string;
  canManageIndustries?: boolean;
}) {
  const current = defaults?.industry ?? "";
  const options = current && !industries.includes(current) ? [current, ...industries] : industries;

  return (
    <ActionForm action={action} successMessage={successMessage} className="flex flex-col gap-4 rounded-lg border border-gs-gray/15 bg-white p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">Client Name</label>
        <input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name}
          className="field"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry" className="text-sm font-medium">Industry</label>
        <Select id="industry" name="industry" defaultValue={current} className="field">
          <option value="">Not specified</option>
          {options.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
        {canManageIndustries && (
          <p className="text-xs text-gs-gray">
            Need another option?{" "}
            <Link href="/admin/industries" className="font-medium text-gs-red hover:underline">Manage industries</Link>
          </p>
        )}
      </div>

      <SaveButton>{submitLabel}</SaveButton>
    </ActionForm>
  );
}
