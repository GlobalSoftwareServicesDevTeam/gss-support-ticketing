/**
 * Customer context helpers for filtering data by customer scope.
 * 
 * When a user is linked to a Customer via a Contact record, they should
 * only see data belonging to their Customer (company). Admins bypass this.
 */

export interface CustomerPermissions {
  tickets: boolean;
  projects: boolean;
  billing: boolean;    // invoices, payments, arrangements
  hosting: boolean;    // hosting orders, domains, DNS
  documents: boolean;
  code: boolean;       // code history & downloads
  notifications: boolean;
  manageContacts: boolean;
}

export interface CustomerContext {
  customerId: string;
  contactId: string;
  isPrimaryContact: boolean;
  permissions: CustomerPermissions;
}

/**
 * Extract customer context from session.
 * Returns null if the user is not linked to any customer (e.g. admin accounts).
 */
export function getCustomerContext(session: {
  user?: {
    id?: string;
    role?: string;
    customerId?: string;
    contactId?: string;
    isPrimaryContact?: boolean;
    customerPermissions?: Record<string, boolean>;
  };
}): CustomerContext | null {
  const user = session?.user;
  if (!user?.customerId || !user?.contactId) return null;

  return {
    customerId: user.customerId,
    contactId: user.contactId,
    isPrimaryContact: user.isPrimaryContact || false,
    permissions: {
      tickets: user.customerPermissions?.tickets ?? true,
      projects: user.customerPermissions?.projects ?? true,
      billing: user.customerPermissions?.billing ?? true,
      hosting: user.customerPermissions?.hosting ?? true,
      documents: user.customerPermissions?.documents ?? true,
      code: user.customerPermissions?.code ?? true,
      notifications: user.customerPermissions?.notifications ?? true,
      manageContacts: user.customerPermissions?.manageContacts ?? false,
    },
  };
}

/**
 * Check if the user is an admin (bypasses customer filtering).
 */
export function isAdmin(session: { user?: { role?: string } }): boolean {
  return session?.user?.role === "ADMIN";
}
