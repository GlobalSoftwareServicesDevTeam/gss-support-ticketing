import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isIisConfigured,
  listAppPools,
  startAppPool,
  stopAppPool,
  recycleAppPool,
} from "@/lib/iis";
import { logAudit } from "@/lib/audit";

// GET: List application pools
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isIisConfigured();
  if (!configured) {
    return NextResponse.json({ error: "IIS API not configured" }, { status: 400 });
  }

  try {
    const pools = await listAppPools();
    return NextResponse.json({ pools });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list app pools" },
      { status: 500 }
    );
  }
}

// POST: Actions on app pools (start, stop, recycle)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isIisConfigured();
  if (!configured) {
    return NextResponse.json({ error: "IIS API not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, poolId, poolName } = body;

  if (!poolId || !action) {
    return NextResponse.json({ error: "poolId and action required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "start":
        await startAppPool(poolId);
        break;
      case "stop":
        await stopAppPool(poolId);
        break;
      case "recycle":
        await recycleAppPool(poolId);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    logAudit({
      action: "UPDATE",
      entity: "IIS_APP_POOL",
      entityId: poolId,
      description: `App pool "${poolName || poolId}" action: ${action}`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Failed to ${action} app pool` },
      { status: 500 }
    );
  }
}
