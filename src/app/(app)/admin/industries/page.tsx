import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createIndustry, renameIndustry, deleteIndustry } from "@/lib/actions/industries";
import { PageHeader } from "@/components/page-header";
import { IndustryList } from "./industry-list";

export default async function IndustriesPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");

  const industries = await prisma.industry.findMany({ orderBy: { name: "asc" } });
  const usage = await prisma.client.groupBy({
    by: ["industry"],
    where: { industry: { not: null } },
    _count: { _all: true },
  });
  const clientCount = new Map(usage.map((u) => [u.industry, u._count._all]));

  return (
    <div className="page-md">
      <PageHeader
        title="Industries"
        description={<>
The options shown in the Industry dropdown on the Client form. Renaming an industry updates every
        client that uses it; an industry in use can&apos;t be deleted until those clients are moved.
</>}
      />
      <IndustryList
        industries={industries.map((i) => ({ id: i.id, name: i.name, clientCount: clientCount.get(i.name) ?? 0 }))}
        createAction={createIndustry}
        renameAction={renameIndustry}
        deleteAction={deleteIndustry}
      />
    </div>
  );
}
