export type StaffPermission =
  | "manageTickets"
  | "manageProjects"
  | "manageBilling"
  | "manageHosting"
  | "manageUsers"
  | "manageDocuments"
  | "manageCode"
  | "viewAuditLogs"
  | "manageSettings"
  | "manageCustomers"
  | "manageTasks"
  | "manageSentry"
  | "bulkEmail";

export type StaffPermissions = Record<StaffPermission, boolean>;

// Map route prefixes to required staff permissions
export const routePermissionMap: Record<string, StaffPermission> = {
  "/users": "manageUsers",
  "/email-settings": "manageSettings",
  "/flagged-emails": "manageSettings",
  "/signing": "manageDocuments",
  "/task-schedule": "manageTasks",
  "/code-downloads": "manageCode",
  "/hosting-admin": "manageHosting",
  "/audit-logs": "viewAuditLogs",
  "/customers": "manageCustomers",
  "/contacts": "manageCustomers",
  "/send-documents": "manageBilling",
  "/sentry": "manageSentry",
  "/bulk-email": "bulkEmail",
  "/github-repos": "manageCode",
  "/system-settings": "manageSettings",
  "/mobile-apps": "manageSettings",
  "/staff-roles": "manageUsers",
};

// Check if a session user has a specific staff permission
export function hasStaffPermission(
  user: { role?: string; staffPermissions?: StaffPermissions } | undefined,
  permission: StaffPermission
): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "EMPLOYEE" && user.staffPermissions) {
    return user.staffPermissions[permission] === true;
  }
  return false;
}

// Check if user is internal staff (ADMIN or EMPLOYEE)
export function isStaff(
  user: { role?: string } | undefined
): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "EMPLOYEE";
}

// Permission labels for UI
export const permissionLabels: Record<StaffPermission, { label: string; description: string }> = {
  manageTickets: { label: "Manage Tickets", description: "Create, edit, assign, and close support tickets" },
  manageProjects: { label: "Manage Projects", description: "Create and manage client projects" },
  manageBilling: { label: "Manage Billing", description: "Access invoices, payments, quotes, and send documents" },
  manageHosting: { label: "Manage Hosting", description: "Manage hosting orders and admin hosting" },
  manageUsers: { label: "Manage Users", description: "Create, edit, and delete users and staff roles" },
  manageDocuments: { label: "Manage Documents", description: "Manage documents and document signing" },
  manageCode: { label: "Manage Code", description: "Access code downloads, GitHub repos, and linked repos" },
  viewAuditLogs: { label: "View Audit Logs", description: "View system audit logs" },
  manageSettings: { label: "Manage Settings", description: "Access system settings, email settings, and flagged emails" },
  manageCustomers: { label: "Manage Customers", description: "Create and manage customers and contacts" },
  manageTasks: { label: "Manage Tasks", description: "Manage task schedule and daily tasks" },
  manageSentry: { label: "Manage Sentry", description: "Configure Sentry integration and view error tracking" },
  bulkEmail: { label: "Bulk Email", description: "Send bulk emails to customers" },
};
