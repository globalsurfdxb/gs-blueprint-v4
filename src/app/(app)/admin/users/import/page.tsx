import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { ImportForm } from "./import-form";
import { PageHeader } from "@/components/page-header";

export default async function ImportUsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser)) {
    redirect("/");
  }

  return (
    <div className="page-md">
      <PageHeader
        title="Import Users"
        description={<>
Upload a spreadsheet to create several users at once. Columns: Name, Email, Location, Role, Cluster, Pod,
        Restricted Pods, Status, Password. The Reference sheet in the template lists the allowed values.
</>}
      />
      <ImportForm />
    </div>
  );
}
