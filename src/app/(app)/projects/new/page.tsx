import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canCreateProject,
  getEligibleAccountManagers,
  getEligibleDependencyTrackers,
  isAdmin,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createProject } from "@/lib/actions/projects";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { OneDriveLinksField } from "./onedrive-links-field";
import { PageHeader } from "@/components/page-header";
import { Select } from "@/components/select";

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateProject(user)) redirect("/projects");

  // Accountant is intake-only (PRD correction #7): Task Group attachment and Account
  // Manager designation are the owning Cluster Head's job afterward, so those sections
  // (and the queries behind them) only apply for Admin.
  const canSetExtras = isAdmin(user);

  const [clients, serviceTypes, allClusters, leadRoles, accountManagers, dependencyTrackers] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.serviceType.findMany({ orderBy: { name: "asc" } }),
    prisma.cluster.findMany({ orderBy: { name: "asc" } }),
    canSetExtras
      ? prisma.userRole.findMany({
          where: { role: "LEAD" },
          include: { user: true, cluster: true, pod: true },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    canSetExtras ? getEligibleAccountManagers() : Promise.resolve([]),
    canSetExtras ? getEligibleDependencyTrackers() : Promise.resolve([]),
  ]);

  const clusters = allClusters;

  // One checkbox per LEAD-role instance (not deduped by user) — attaching a Lead picks
  // exactly one discipline (cluster/pod tag) to represent, and each option here is one
  // such instance. Cross-cluster by design: every Lead in the agency is selectable here,
  // not just ones in the cluster being chosen above.
  const leadOptions = leadRoles
    .filter((r) => r.user.isActive)
    .map((r) => ({
      id: r.id,
      label: [r.user.name, [r.cluster?.name, r.pod?.name].filter(Boolean).join(" · ")].filter(Boolean).join(" · "),
    }));

  return (
    <div>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gs-gray">
        <Link href="/projects" className="hover:text-gs-black hover:underline">
          Projects
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-gs-black/70">New project</span>
      </nav>
      <PageHeader title="New Project" description="Set up the project once; Leads, tasks and sprints are added afterwards." />

      <ActionForm action={createProject} successMessage="Project created." className="mt-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Project details" description="What the project is and who it is for.">
              <Field label="Project Name" htmlFor="name" required hint="Convention: Client + Service Type (each service line is its own project).">
                <input id="name" name="name" required placeholder="e.g. Inno SEO" className="field" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client" htmlFor="clientId" required>
                  <Select id="clientId" name="clientId" required className="field">
                    <option value="" disabled>Select a client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Service Type" htmlFor="serviceTypeId" required>
                  <Select id="serviceTypeId" name="serviceTypeId" required className="field">
                    <option value="" disabled>Select a service type</option>
                    {serviceTypes.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cluster" htmlFor="clusterId" required>
                  <Select
                    id="clusterId"
                    name="clusterId"
                    required
                    defaultValue={clusters.length === 1 ? clusters[0].id : undefined}
                    className="field"
                  >
                    {clusters.length !== 1 && <option value="" disabled>Select a cluster</option>}
                    {clusters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue="PLANNING" className="field">
                    <option value="PLANNING">Planning</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                </Field>
              </div>

              <Field label="Reference Number" htmlFor="referenceNumber" optional hint="Invoice / PO / proposal — free text.">
                <input id="referenceNumber" name="referenceNumber" className="field" />
              </Field>

              <Field label="Summary" htmlFor="summary" optional>
                <textarea
                  id="summary"
                  name="summary"
                  rows={3}
                  placeholder="What is this project for, at a glance..."
                  className="field"
                />
              </Field>
            </Section>

            <Section title="Schedule & hours" description="Dates and the hours budget the team works within.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start Date" htmlFor="startDate">
                  <input id="startDate" name="startDate" type="date" className="field" />
                </Field>
                <Field label="Deadline" htmlFor="deadline">
                  <input id="deadline" name="deadline" type="date" className="field" />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-medium text-gs-black/80">
                  Max Allocated Hours <span className="font-normal text-gs-gray">(optional)</span>
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gs-gray/25 p-3 text-sm has-[:checked]:border-gs-red has-[:checked]:bg-gs-red/5">
                    <input type="radio" name="hoursAllocationType" value="ONE_TIME" defaultChecked className="mt-0.5" />
                    <span>
                      <span className="block font-medium">One-time</span>
                      <span className="block text-xs text-gs-gray">Total hours for the whole project</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gs-gray/25 p-3 text-sm has-[:checked]:border-gs-red has-[:checked]:bg-gs-red/5">
                    <input type="radio" name="hoursAllocationType" value="MONTHLY" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Monthly</span>
                      <span className="block text-xs text-gs-gray">Retainer, e.g. SEO / Social</span>
                    </span>
                  </label>
                </div>
                <input
                  id="maxAllocatedHours"
                  name="maxAllocatedHours"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Hours"
                  aria-label="Max allocated hours"
                  className="field sm:max-w-48"
                />
                <p className="text-xs text-gs-gray">Visible to the assigned Lead — flags retainer over-servicing risk.</p>
              </div>
            </Section>

            <Section title="Reference links" description="Shared documentation the whole team can open.">
              <OneDriveLinksField />
            </Section>
          </div>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20">
            {canSetExtras ? (
              <Section title="Team" description="Optional now — all of this can be changed from the project page.">
                <Field
                  label="Account Manager"
                  htmlFor="accountManagerId"
                  optional
                  hint="Account/Client Services users in the Project Delivery & Client Services cluster."
                >
                  <Select id="accountManagerId" name="accountManagerId" defaultValue="" className="field">
                    <option value="">Unassigned</option>
                    {accountManagers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Dependency Tracker"
                  htmlFor="dependencyTrackerId"
                  optional
                  hint="View-only coordinator for this project's cross-group-linked tasks."
                >
                  <Select id="dependencyTrackerId" name="dependencyTrackerId" defaultValue="" className="field">
                    <option value="">Unassigned</option>
                    {dependencyTrackers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </Select>
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-gs-black/80">Discipline Task Groups</span>
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-lg border border-gs-gray/25 p-1.5">
                    {leadOptions.length === 0 && <p className="p-2 text-sm text-gs-gray">No one holds a Lead role yet.</p>}
                    {leadOptions.map((l) => (
                      <label key={l.id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-gs-light">
                        <input type="checkbox" name="leadRoleIds" value={l.id} className="mt-0.5" />
                        <span>{l.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gs-gray">
                    Attaching a Lead creates their discipline&apos;s Task Group (e.g. an SEO Lead plus a separate Design Lead).
                  </p>
                </div>
              </Section>
            ) : (
              <Section title="Team">
                <p className="text-sm text-gs-gray">
                  The owning Cluster Head attaches discipline Leads and assigns an Account Manager after intake.
                </p>
              </Section>
            )}
          </aside>
        </div>

        {/* Stays in view while you scroll the form. */}
        <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-2 rounded-xl border border-gs-gray/15 bg-white/95 px-4 py-3 shadow-md backdrop-blur">
          <Link href="/projects" className="btn btn-secondary">
            Cancel
          </Link>
          <SubmitButton pendingLabel="Creating…" className="btn btn-primary min-w-36">
            Create Project
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}

/** A titled card that groups related fields. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gs-gray/10 bg-white p-5 shadow-sm md:p-6">
      <h2 className="font-heading text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gs-gray">{description}</p>}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** One labelled field: required star / "(optional)" marker, and a hint line underneath. */
function Field({
  label,
  htmlFor,
  required,
  optional,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-gs-black/80">
        {label}
        {required && <span className="text-gs-red"> *</span>}
        {optional && <span className="font-normal text-gs-gray"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gs-gray">{hint}</p>}
    </div>
  );
}
