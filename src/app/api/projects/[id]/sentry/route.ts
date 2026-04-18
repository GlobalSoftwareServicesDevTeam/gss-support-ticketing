import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSettings, setSetting, deleteSetting } from "@/lib/settings";
import { getCustomerContext } from "@/lib/customer-context";
import { logAudit } from "@/lib/audit";

function keyFor(projectId: string, suffix: string): string {
  return `PROJECT_${projectId}_SENTRY_${suffix}`;
}

function hasSentryAccess(session: {
  user?: {
    role?: string;
    staffPermissions?: { manageSentry?: boolean };
  };
} | null): boolean {
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;
  return Boolean(session.user.staffPermissions?.manageSentry);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, customerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!hasSentryAccess(session)) {
    const ctx = getCustomerContext(session);
    const isCustomerProject = ctx && project.customerId === ctx.customerId;
    const assignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id, userId: session.user.id },
      select: { id: true },
    });
    if (!isCustomerProject && !assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const keys = [
    keyFor(id, "ENABLED"),
    keyFor(id, "PROJECT"),
    keyFor(id, "ENV"),
    keyFor(id, "ASSIGNEE_ID"),
    keyFor(id, "AUTO_TASK"),
    keyFor(id, "SECRET"),
    keyFor(id, "WEBHOOK_TOKEN"),
  ];
  const settings = await getSettings(keys);

  const webhookToken = settings[keyFor(id, "WEBHOOK_TOKEN")] || "";
  const webhookUrl = webhookToken
    ? `${_req.nextUrl.origin}/api/webhooks/sentry?projectId=${id}&token=${encodeURIComponent(webhookToken)}`
    : `${_req.nextUrl.origin}/api/webhooks/sentry?projectId=${id}`;

  return NextResponse.json({
    enabled: settings[keyFor(id, "ENABLED")] === "true",
    projectSlug: settings[keyFor(id, "PROJECT")] || "",
    environment: settings[keyFor(id, "ENV")] || "",
    defaultAssigneeId: settings[keyFor(id, "ASSIGNEE_ID")] || "",
    autoCreateTask: settings[keyFor(id, "AUTO_TASK")] !== "false",
    clientSecret: settings[keyFor(id, "SECRET")] || "",
    webhookToken,
    webhookUrl,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!hasSentryAccess(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, projectName: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();
  const enabled = Boolean(body.enabled);
  const projectSlug = typeof body.projectSlug === "string" ? body.projectSlug.trim() : "";
  const environment = typeof body.environment === "string" ? body.environment.trim() : "";
  const defaultAssigneeId = typeof body.defaultAssigneeId === "string" ? body.defaultAssigneeId.trim() : "";
  const autoCreateTask = body.autoCreateTask !== false;
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  const webhookToken = typeof body.webhookToken === "string" ? body.webhookToken.trim() : "";

  await setSetting(keyFor(id, "ENABLED"), enabled ? "true" : "false");
  await setSetting(keyFor(id, "AUTO_TASK"), autoCreateTask ? "true" : "false");

  if (projectSlug) {
    await setSetting(keyFor(id, "PROJECT"), projectSlug);
  } else {
    await deleteSetting(keyFor(id, "PROJECT"));
  }

  if (environment) {
    await setSetting(keyFor(id, "ENV"), environment);
  } else {
    await deleteSetting(keyFor(id, "ENV"));
  }

  if (defaultAssigneeId) {
    await setSetting(keyFor(id, "ASSIGNEE_ID"), defaultAssigneeId);
  } else {
    await deleteSetting(keyFor(id, "ASSIGNEE_ID"));
  }

  if (clientSecret) {
    await setSetting(keyFor(id, "SECRET"), clientSecret);
  } else {
    await deleteSetting(keyFor(id, "SECRET"));
  }

  if (webhookToken) {
    await setSetting(keyFor(id, "WEBHOOK_TOKEN"), webhookToken);
  } else {
    await deleteSetting(keyFor(id, "WEBHOOK_TOKEN"));
  }

  logAudit({
    action: "UPDATE",
    entity: "PROJECT",
    entityId: id,
    description: `Updated project Sentry settings for ${project.projectName}`,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    metadata: {
      sentryEnabled: enabled,
      sentryProjectSlug: projectSlug || null,
      sentryEnvironment: environment || null,
      sentryDefaultAssigneeId: defaultAssigneeId || null,
      sentryAutoCreateTask: autoCreateTask,
      sentryClientSecretConfigured: Boolean(clientSecret),
      sentryWebhookTokenConfigured: Boolean(webhookToken),
    },
  });

  return NextResponse.json({ success: true });
}
