import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canCreateClient, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/actions/clients";
import { ClientForm } from "../client-form";
import { PageHeader } from "@/components/page-header";

export default async function NewClientPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateClient(user)) redirect("/clients");

  const industries = (await prisma.industry.findMany({ orderBy: { name: "asc" } })).map((i) => i.name);

  return (
    <div className="page-sm">
      <PageHeader
        title="New Client"
      />
      <div className="mt-6">
        <ClientForm
          action={createClient}
          industries={industries}
          submitLabel="Create Client"
          canManageIndustries={isAdmin(user)}
        />
      </div>
    </div>
  );
}
