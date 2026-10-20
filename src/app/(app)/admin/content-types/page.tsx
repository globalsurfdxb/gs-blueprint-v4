import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageContentTypes } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createContentType, updateContentType, deleteContentType } from "@/lib/actions/content-types";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EditContentTypeForm } from "./edit-content-type-form";
import { DeleteContentTypeButton } from "./delete-content-type-button";
import { PageHeader } from "@/components/page-header";

export default async function ContentTypesPage() {
  const user = await getCurrentUser();
  if (!user || !canManageContentTypes(user)) {
    redirect("/");
  }

  const contentTypes = await prisma.contentType.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="page-md">
      <PageHeader
        title="Content Types"
        description={<>
Used by the Social Media Content Calendar to compute Due Dates — Content Lead Time must be
        greater than Design Lead Time, since Content is always due earlier than Design.
</>}
      />

      <div className="mt-6 flex flex-col gap-2">
        {contentTypes.length === 0 && (
          <p className="text-sm text-gs-gray">No Content Types yet.</p>
        )}
        {contentTypes.map((ct) => {
          const updateWithId = updateContentType.bind(null, ct.id);
          const deleteWithId = deleteContentType.bind(null, ct.id);
          return (
            <div key={ct.id} className="rounded-md border border-gs-gray/15 bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{ct.name}</span>
                  <span className="ml-2 text-gs-gray">
                    Content: {ct.contentLeadTimeDays}d before Publish · Design: {ct.designLeadTimeDays}d before Publish
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <details>
                    <summary className="cursor-pointer text-xs text-gs-gray hover:text-gs-black">Edit</summary>
                    <div className="mt-2">
                      <EditContentTypeForm defaults={ct} action={updateWithId} />
                    </div>
                  </details>
                  <DeleteContentTypeButton name={ct.name} action={deleteWithId} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-gs-gray/15 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase text-gs-gray">Add Content Type</h2>
        <ActionForm action={createContentType} successMessage="Content type added." className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              name="name"
              required
              className="field"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contentLeadTimeDays" className="text-sm font-medium">
                Content Lead Time (days)
              </label>
              <input
                id="contentLeadTimeDays"
                name="contentLeadTimeDays"
                type="number"
                min="0"
                required
                className="field"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="designLeadTimeDays" className="text-sm font-medium">
                Design Lead Time (days)
              </label>
              <input
                id="designLeadTimeDays"
                name="designLeadTimeDays"
                type="number"
                min="0"
                required
                className="field"
              />
            </div>
          </div>
          <SubmitButton
            pendingLabel="Adding…"
            className="btn btn-primary mt-2 self-start"
          >
            Add Content Type
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
