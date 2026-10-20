import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/actions/users";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RoleFields } from "../role-fields";
import { PageHeader } from "@/components/page-header";

export default async function NewUserPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser)) {
    redirect("/");
  }

  const clusters = await prisma.cluster.findMany({
    include: { pods: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page-sm">
      <PageHeader
        title="New User"
      />

      <ActionForm action={createUser} successMessage="User created." className="mt-6 flex flex-col gap-4 rounded-lg border border-gs-gray/15 bg-white p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input
            id="name"
            name="name"
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
            required
            className="field"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">Initial Password</label>
          <input
            id="password"
            name="password"
            type="text"
            required
            minLength={8}
            className="field"
          />
          <p className="text-xs text-gs-gray">Share this with the user directly. There is no password-reset flow in v1.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="location" className="text-sm font-medium">Location</label>
          <select
            id="location"
            name="location"
            defaultValue="DUBAI"
            className="field"
          >
            <option value="DUBAI">Dubai</option>
            <option value="INDIA">India</option>
          </select>
        </div>

        <RoleFields clusters={clusters} />

        <SubmitButton
          pendingLabel="Creating…"
          className="btn btn-primary mt-2 self-start"
        >
          Create User
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
