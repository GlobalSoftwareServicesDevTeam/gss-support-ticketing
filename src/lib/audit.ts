import prisma from "@/lib/prisma";
import { headers } from "next/headers";

interface AuditParams {
  action: string;
  entity: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  userName?: string;
}

export async function logAudit(params: AuditParams) {
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    try {
      const hdrs = await headers();
      ipAddress =
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        hdrs.get("x-real-ip") ||
        null;
      userAgent = hdrs.get("user-agent") || null;
    } catch {
      // headers() may fail outside request context
    }

    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId || null,
        description: params.description,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress,
        userAgent,
        userId: params.userId || null,
        userName: params.userName || null,
      },
    });
  } catch (err) {
    // Never let audit logging break the main flow
    console.error("Audit log error:", err);
  }
}
