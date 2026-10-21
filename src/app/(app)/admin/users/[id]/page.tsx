import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateUser, setUserPassword, changeUserRole, deleteUser, reassignAndDeleteUser } from "@/lib/actions/users";
import { EditRoleForm } from "./edit-role-form";
import { DeleteUserButton } from "./delete-user-button";
import { ReassignDeleteForm } from "./reassign-delete-form";
import { PageHeader } from "@/components/page-header";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PasswordInput } from "@/components/password-input";
import { Select } from "@/components/select";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  CLUSTER_HEAD: "Cluster Head",
  LEAD: "Lead",
  ACCOUNT_CLIENT_SERVICES: "Account/Client Services",
  CONTRIBUTOR: "Contributor",
  ACCOUNTANT: "Accountant",
};

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser)) {
    redirect("/");
  }

  const { id } = await params;
  const [user, clusters, activeUsers] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { cluster: true, pod: true, restrictedPods: { include: { pod: true } } } } },
    }),
    prisma.cluster.findMany({ include: { pods: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, id: { not: id } },
      include: { roles: { include: { pod: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!user) notFound();

  const updateUserWithId = updateUser.bind(null, user.id);
  const setUserPasswordWithId = setUserPassword.bind(null, user.id);
  const deleteUserWithId = deleteUser.bind(null, user.id);
  const reassignAndDeleteWithId = reassignAndDeleteUser.bind(null, user.id);
  const canDelete = user.id !== currentUser.id;

  const leavingRole = user.roles[0];
  const sameRole = (u: (typeof activeUsers)[number]) =>
    !!leavingRole && u.roles.some((r) => r.role === leavingRole.role && r.podId === leavingRole.podId);
  const candidates = [...activeUsers]
    .sort((a, b) => Number(sameRole(b)) - Number(sameRole(a)))
    .map((u) => ({
      id: u.id,
      label: `${u.name} — ${u.roles[0] ? ROLE_LABELS[u.roles[0].role] : "No role"}${u.roles[0]?.pod ? ` · ${u.roles[0].pod.name}` : ""}${sameRole(u) ? " (same role)" : ""}`,
    }));
  const defaultTargetId = activeUsers.find(sameRole)?.id ?? "";

  return (
    <div className="page-md">
      <PageHeader
        title={user.name}
      />

      <ActionForm
        action={updateUserWithId}
        className="mt-6 flex flex-col gap-4 rounded-lg border border-gs-gray/15 bg-white p-6"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input
            id="name"
            name="name"
            defaultValue={user.name}
            required
            className="field"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={user.email}
            required
            className="field"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className="text-sm font-medium">Location</label>
          <Select
            id="location"
            name="location"
            defaultValue={user.location}
            className="field"
          >
            <option value="DUBAI">Dubai</option>
            <option value="INDIA">India</option>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="isActive" defaultChecked={user.isActive} />
          Active
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="restrictToOwnTasks" defaultChecked={user.restrictToOwnTasks} />
            Only see their own tasks
          </label>
          <p className="ml-6 text-xs text-gs-gray">
            For a Lead who shouldn&apos;t see teammates&apos; work: they then see only tasks assigned to or created by
            them, and none of the other people in their group.
          </p>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            className="btn btn-primary self-start"
          >
            Save Changes
          </button>
        </div>
      </ActionForm>

      <ActionForm
        action={setUserPasswordWithId}
        successMessage={`Password updated for ${user.name}.`}
        className="mt-4 flex flex-col gap-4 rounded-lg border border-gs-gray/15 bg-white p-6"
      >
        <div>
          <h2 className="text-sm font-semibold">Set a new password</h2>
          <p className="mt-1 text-xs text-gs-gray">
            Replaces {user.id === currentUser.id ? "your" : "their"} current password straight away. Share the new one
            with {user.id === currentUser.id ? "yourself securely" : "them securely"}; it can be changed again from the profile page.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPassword" className="text-sm font-medium">New password</label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>
        <SubmitButton pendingLabel="Updating…" className="btn btn-secondary self-start">
          Update Password
        </SubmitButton>
      </ActionForm>

      {canDelete && (
        <div className="mt-4">
          <DeleteUserButton userName={user.name} action={deleteUserWithId} />
          <p className="mt-2 text-xs text-gs-gray">
            Only works for accounts with no projects, tasks, or other activity tied to them. For
            anyone with history, deactivate them (Active checkbox above), then use Reassign &amp;
            delete.
          </p>
        </div>
      )}

      {canDelete && !user.isActive && (
        <ReassignDeleteForm
          userName={user.name}
          candidates={candidates}
          defaultTargetId={defaultTargetId}
          action={reassignAndDeleteWithId}
        />
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase text-gs-gray">Role</h2>
        <p className="mt-1 text-xs text-gs-gray">
          Every user holds exactly one role — change it in place below rather than adding a second.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {user.roles.length === 0 && (
            <p className="text-sm text-gs-gray">No role assigned — this shouldn&apos;t happen; contact support.</p>
          )}
          {user.roles.map((r) => {
            const changeRoleAction = changeUserRole.bind(null, user.id, r.id);
            return (
              <div
                key={r.id}
                className="rounded-md border border-gs-gray/15 bg-white px-4 py-2 text-sm"
              >
                <span>
                  {ROLE_LABELS[r.role]}
                  {r.cluster ? ` · ${r.cluster.name}` : ""}
                  {r.pod ? ` · ${r.pod.name}` : ""}
                  {r.restrictedPods.length > 0 &&
                    ` · Restricted to ${r.restrictedPods.map((rp) => rp.pod.name).join(", ")}`}
                </span>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-gs-gray hover:text-gs-black">
                    Change
                  </summary>
                  <div className="mt-2">
                    <EditRoleForm
                      clusters={clusters}
                      defaults={{
                        role: r.role,
                        clusterId: r.clusterId,
                        podId: r.podId,
                        restrictedPodIds: r.restrictedPods.map((rp) => rp.podId),
                      }}
                      action={changeRoleAction}
                    />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
