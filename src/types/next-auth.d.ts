import { DefaultSession } from "next-auth";
import type { StaffPermissions } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      company?: string;
      customerId?: string;
      contactId?: string;
      isPrimaryContact?: boolean;
      customerPermissions?: Record<string, boolean>;
      staffPermissions?: StaffPermissions;
      hasUnsignedContracts?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    company?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    company?: string;
    customerId?: string;
    contactId?: string;
    isPrimaryContact?: boolean;
    customerPermissions?: Record<string, boolean>;
    staffPermissions?: StaffPermissions;
    hasUnsignedContracts?: boolean;
  }
}
