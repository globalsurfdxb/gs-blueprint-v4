import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageSprintWorkflow } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { setPodSprintWorkflow } from "@/lib/actions/sprint-workflow";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";

export default async function SprintWorkflowSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !canManageSprintWorkflow(user)) {
    redirect("/");
  }

  const pods = await prisma.pod.findMany({
    include: { cluster: { select: { name: true } } },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  return (
    <div className="page-md">
      <PageHeader
        title="Sprint Workflow"
        description={<>
When enabled for a discipline, its Task Groups get an optional Sprint field on tasks, Sprint
        management on the project page, and the Active-Sprint board filters. Every other discipline is
        unaffected. Typically only Development.
</>}
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
            <tr>
              <th className="px-4 py-2">Discipline</th>
              <th className="px-4 py-2">Cluster</th>
              <th className="px-4 py-2">Sprint Workflow</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => (
              <tr key={pod.id} className="border-t border-gs-gray/10">
                <td className="px-4 py-2 font-medium">{pod.name}</td>
                <td className="px-4 py-2 text-gs-gray">{pod.cluster.name}</td>
                <td className="px-4 py-2">
                  <span className={pod.sprintWorkflowEnabled ? "font-medium text-green-600" : "text-gs-gray"}>
                    {pod.sprintWorkflowEnabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <ActionForm
                    action={setPodSprintWorkflow}
                    successMessage={`Sprint Workflow ${pod.sprintWorkflowEnabled ? "disabled" : "enabled"} for ${pod.name}.`}
                  >
                    <input type="hidden" name="podId" value={pod.id} />
                    <input type="hidden" name="enabled" value={pod.sprintWorkflowEnabled ? "false" : "true"} />
                    <SubmitButton
                      pendingLabel="Saving…"
                      className="btn btn-secondary btn-sm"
                    >
                      {pod.sprintWorkflowEnabled ? "Disable" : "Enable"}
                    </SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
