// Role vocabulary shared by the user create/edit actions and the bulk import, so the cluster/pod
// rules can't drift between the two paths.

export const ROLE_VALUES = [
  "ADMIN",
  "CLUSTER_HEAD",
  "LEAD",
  "ACCOUNT_CLIENT_SERVICES",
  "CONTRIBUTOR",
  "ACCOUNTANT",
] as const;

export type RoleValue = (typeof ROLE_VALUES)[number];

export const ROLE_LABELS: Record<RoleValue, string> = {
  ADMIN: "Admin",
  CLUSTER_HEAD: "Cluster Head",
  LEAD: "Lead",
  ACCOUNT_CLIENT_SERVICES: "Account/Client Services",
  CONTRIBUTOR: "Contributor",
  ACCOUNTANT: "Accountant",
};

// Cross-cutting roles, like Admin — not tied to any cluster or pod.
const UNSCOPED_ROLES: readonly string[] = ["ADMIN", "ACCOUNTANT"];

export function isUnscopedRole(role: string) {
  return UNSCOPED_ROLES.includes(role);
}

// Account/Client Services may be CLUSTER-LESS (PRD v1.26): a "ceiling only" coordinator such
// as a Dependency Tracker — the ACS permission ceiling with NO cluster oversight. The cluster
// stays REQUIRED for Cluster Head, Lead and Contributor.
export function clusterIsOptional(role: string) {
  return isUnscopedRole(role) || role === "ACCOUNT_CLIENT_SERVICES";
}
