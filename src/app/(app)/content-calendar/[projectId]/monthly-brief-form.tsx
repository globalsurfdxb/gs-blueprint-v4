import { SaveButton } from "@/components/save-button";
import { ActionForm } from "@/components/action-form";

export function MonthlyBriefForm({
  month,
  year,
  defaultText,
  action,
}: {
  month: number;
  year: number;
  defaultText: string;
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      <textarea
        name="text"
        rows={4}
        defaultValue={defaultText}
        placeholder="This month's theme, key insights, links to decks..."
        className="field"
      />
      <SaveButton className="btn btn-secondary self-start">
        Save Brief
      </SaveButton>
    </ActionForm>
  );
}
