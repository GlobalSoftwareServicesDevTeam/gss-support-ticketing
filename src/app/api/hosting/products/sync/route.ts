import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { listServicePlansDetailed } from "@/lib/plesk";
import { logAudit } from "@/lib/audit";

// POST /api/hosting/products/sync — sync Plesk plans to hosting products
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { planIds } = body as { planIds?: number[] };

  try {
    const pleskPlans = await listServicePlansDetailed();
    const toSync = planIds
      ? pleskPlans.filter((p) => planIds.includes(p.id))
      : pleskPlans;

    let created = 0;
    let updated = 0;

    for (const plan of toSync) {
      const existing = await prisma.hostingProduct.findFirst({
        where: { pleskPlanId: plan.id },
      });

      const data = {
        name: plan.name,
        type: "HOSTING" as const,
        pleskPlanName: plan.name,
        pleskPlanId: plan.id,
        diskSpace: plan.diskSpace,
        bandwidth: plan.bandwidth,
        databases: plan.databases,
        emailAccounts: plan.emailAccounts,
        emailStorage: plan.emailStorage,
        ftpAccounts: plan.ftpAccounts,
        subdomains: plan.subdomains,
        sslSupport: plan.sslSupport,
        phpSupport: plan.phpSupport,
      };

      if (existing) {
        await prisma.hostingProduct.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.hostingProduct.create({
          data: {
            ...data,
            monthlyPrice: 0, // Admin must set pricing
            description: `Hosting plan synced from Plesk: ${plan.name}`,
          },
        });
        created++;
      }
    }

    logAudit({
      action: "SYNC",
      entity: "HOSTING_PRODUCT",
      description: `Synced ${created + updated} plans from Plesk (${created} new, ${updated} updated)`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { created, updated, totalPlans: toSync.length },
    });

    return NextResponse.json({ created, updated, total: toSync.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
