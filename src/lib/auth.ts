import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import type { StaffPermissions } from "./permissions";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const input = credentials.username as string;

        // Allow login with either username or email
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: input },
              { email: input },
            ],
            isDeleted: false,
          },
        });

        if (!user) return null;
        if (!user.emailConfirmed) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          company: user.company || undefined,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, find or create user in our database
      if (account?.provider === "google" || account?.provider === "facebook" || account?.provider === "github") {
        const email = user.email;
        if (!email) return false;

        // Look for existing user by email
        let dbUser = await prisma.user.findFirst({
          where: { email, isDeleted: false },
        });

        if (dbUser) {
          // Link OAuth if not already linked
          if (!dbUser.oauthProvider) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                oauthProvider: account.provider,
                oauthProviderId: account.providerAccountId,
                emailConfirmed: true,
              },
            });
          }
        } else {
          // Create new user from OAuth profile
          const nameParts = (user.name || "").split(" ");
          const firstName = nameParts[0] || email.split("@")[0];
          const lastName = nameParts.slice(1).join(" ") || "";

          dbUser = await prisma.user.create({
            data: {
              email,
              username: email,
              passwordHash: "", // OAuth users don't have a password
              firstName,
              lastName,
              role: "USER",
              emailConfirmed: true,
              oauthProvider: account.provider,
              oauthProviderId: account.providerAccountId,
            },
          });
        }

        // Attach our DB user ID and role so the jwt callback can use them
        user.id = dbUser.id;
        (user as { role?: string }).role = dbUser.role;
        (user as { company?: string }).company = dbUser.company || undefined;
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.company = (user as { company?: string }).company;
      }
      // On sign-in or token refresh, look up the user's customer link
      if (user || trigger === "update") {
        const userId = user?.id || token.sub;
        if (userId) {
          // Load staff permissions for EMPLOYEE users
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              role: true,
              staffRole: {
                select: {
                  canManageTickets: true,
                  canManageProjects: true,
                  canManageBilling: true,
                  canManageHosting: true,
                  canManageUsers: true,
                  canManageDocuments: true,
                  canManageCode: true,
                  canViewAuditLogs: true,
                  canManageSettings: true,
                  canManageCustomers: true,
                  canManageTasks: true,
                  canManageSentry: true,
                  canBulkEmail: true,
                },
              },
            },
          });

          // Update role from DB (may have changed)
          if (dbUser) {
            token.role = dbUser.role;
          }

          if (dbUser?.role === "EMPLOYEE" && dbUser.staffRole) {
            token.staffPermissions = {
              manageTickets: dbUser.staffRole.canManageTickets,
              manageProjects: dbUser.staffRole.canManageProjects,
              manageBilling: dbUser.staffRole.canManageBilling,
              manageHosting: dbUser.staffRole.canManageHosting,
              manageUsers: dbUser.staffRole.canManageUsers,
              manageDocuments: dbUser.staffRole.canManageDocuments,
              manageCode: dbUser.staffRole.canManageCode,
              viewAuditLogs: dbUser.staffRole.canViewAuditLogs,
              manageSettings: dbUser.staffRole.canManageSettings,
              manageCustomers: dbUser.staffRole.canManageCustomers,
              manageTasks: dbUser.staffRole.canManageTasks,
              manageSentry: dbUser.staffRole.canManageSentry,
              bulkEmail: dbUser.staffRole.canBulkEmail,
            } as StaffPermissions;
          } else {
            token.staffPermissions = undefined;
          }

          const contact = await prisma.contact.findFirst({
            where: { userId, inviteAccepted: true },
            select: {
              id: true,
              isPrimary: true,
              customerId: true,
              canViewTickets: true,
              canViewProjects: true,
              canViewBilling: true,
              canViewHosting: true,
              canViewDocuments: true,
              canViewCode: true,
              canViewNotifications: true,
              canManageContacts: true,
            },
          });
          if (contact) {
            token.customerId = contact.customerId;
            token.contactId = contact.id;
            token.isPrimaryContact = contact.isPrimary;
            token.customerPermissions = {
              tickets: contact.canViewTickets,
              projects: contact.canViewProjects,
              billing: contact.canViewBilling,
              hosting: contact.canViewHosting,
              documents: contact.canViewDocuments,
              code: contact.canViewCode,
              notifications: contact.canViewNotifications,
              manageContacts: contact.canManageContacts,
            };
          } else {
            token.customerId = undefined;
            token.contactId = undefined;
            token.isPrimaryContact = undefined;
            token.customerPermissions = undefined;
            token.hasUnsignedContracts = undefined;
          }

          // Check for unsigned contracts (primary contacts only)
          if (contact?.isPrimary) {
            const signedCount = await prisma.clientContract.count({
              where: {
                contactId: contact.id,
                status: "SIGNED",
                contractType: "NDA",
              },
            });
            token.hasUnsignedContracts = signedCount === 0;
          } else {
            token.hasUnsignedContracts = false;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { company?: string }).company = token.company as string | undefined;
        (session.user as { customerId?: string }).customerId = token.customerId as string | undefined;
        (session.user as { contactId?: string }).contactId = token.contactId as string | undefined;
        (session.user as { isPrimaryContact?: boolean }).isPrimaryContact = token.isPrimaryContact as boolean | undefined;
        (session.user as { customerPermissions?: Record<string, boolean> }).customerPermissions = token.customerPermissions as Record<string, boolean> | undefined;
        (session.user as { staffPermissions?: StaffPermissions }).staffPermissions = token.staffPermissions as StaffPermissions | undefined;
        (session.user as { hasUnsignedContracts?: boolean }).hasUnsignedContracts = token.hasUnsignedContracts as boolean | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
