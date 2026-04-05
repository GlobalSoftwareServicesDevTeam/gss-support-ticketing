import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      company?: string;
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
  }
}
