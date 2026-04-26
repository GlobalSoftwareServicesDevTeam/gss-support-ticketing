import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

// Verify Sentry webhook signature
function verifySentrySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");
  // Strip optional 'sha256=' prefix Sentry may include
  const cleanSig = signature.replace(/^sha256=/, "");
  try {
    const digestBuf = Buffer.from(digest);
    const sigBuf = Buffer.from(cleanSig);
    if (digestBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(digestBuf, sigBuf);
  } catch {
    return false;
  }
}

function normalizeForKey(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractIssueIdFromLink(link: string): string | null {
  const match = link.match(/\/issues\/(\d+)/i);
  return match?.[1] || null;
}

function buildSentryGroupKey(params: {
  sentryProject: string;
  errorTitle: string;
  errorMessage: string;
  sentryLink: string;
  sentryIssueId?: string | null;
  sentryFingerprint?: string | null;
  sentryCulprit?: string | null;
}): string {
  const project = normalizeForKey(params.sentryProject || "unknown");
  const byId = params.sentryIssueId || extractIssueIdFromLink(params.sentryLink || "");
  if (byId) return `sentry:${project}:issue:${byId}`;

  const fingerprint = normalizeForKey(params.sentryFingerprint || "").replace(/[^a-z0-9]+/g, "-");
  if (fingerprint) return `sentry:${project}:fp:${fingerprint.slice(0, 80)}`;

  const title = normalizeForKey(params.errorTitle || "application error");
  const culprit = normalizeForKey(params.sentryCulprit || "");
  const message = normalizeForKey(params.errorMessage || "").slice(0, 180);
  const digest = crypto
    .createHash("sha1")
    .update(`${project}|${title}|${culprit}|${message}`)
    .digest("hex")
    .slice(0, 20);
  return `sentry:${project}:sig:${digest}`;
}

// POST /api/webhooks/sentry — receive Sentry issue alerts
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const queryProjectId = req.nextUrl.searchParams.get("projectId")?.trim() || "";
  const queryToken = req.nextUrl.searchParams.get("token")?.trim() || "";

  let forcedProjectId: string | null = null;
  if (queryToken) {
    const tokenMatch = await prisma.systemSetting.findFirst({
      where: {
        key: { startsWith: "PROJECT_", endsWith: "_SENTRY_WEBHOOK_TOKEN" },
        value: queryToken,
      },
      select: { key: true },
    });

    if (!tokenMatch) {
      // Return 200 to prevent Sentry from disabling the webhook, but don't process
      return NextResponse.json({ ok: false, error: "Invalid webhook token" });
    }

    const key = tokenMatch.key;
    forcedProjectId = key.replace(/^PROJECT_/, "").replace(/_SENTRY_WEBHOOK_TOKEN$/, "") || null;
  }

  if (queryProjectId) {
    if (forcedProjectId && forcedProjectId !== queryProjectId) {
      return NextResponse.json({ ok: false, error: "Webhook token does not match project" });
    }
    forcedProjectId = queryProjectId;
  }

  // Verify signature if secret is configured
  const secret = forcedProjectId
    ? await getSetting(`PROJECT_${forcedProjectId}_SENTRY_SECRET`) || await getSetting("SENTRY_WEBHOOK_SECRET")
    : await getSetting("SENTRY_WEBHOOK_SECRET");
  if (secret) {
    const signature = req.headers.get("sentry-hook-signature");
    if (!verifySentrySignature(rawBody, signature, secret)) {
      // Return 200 to prevent Sentry disabling the webhook, log the failure
      return NextResponse.json({ ok: false, error: "Invalid signature" });
    }
  }

  const hookResource = req.headers.get("sentry-hook-resource");

  // Sentry sends different event types — we handle issue and event alerts
  // Also handle the installation/verification ping
  if (hookResource === "installation") {
    return NextResponse.json({ ok: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle metric_alert and issue_alert triggers
  const data = payload.data || {};

  // Extract error details based on event type
  let errorTitle = "";
  let errorMessage = "";
  let errorLevel = "error";
  let sentryLink = "";
  let sentryProject = "";
  let platform = "";
  let sentryIssueId = "";
  let sentryFingerprint = "";
  let sentryCulprit = "";

  if (hookResource === "issue" || hookResource === "error") {
    // Issue webhook (legacy/integration hook)
    const issue = data.issue || data;
    errorTitle = issue.title || issue.culprit || "Application Error";
    errorMessage = issue.metadata?.value || issue.message || issue.culprit || "";
    errorLevel = issue.level || "error";
    sentryLink = issue.permalink || issue.web_url || "";
    sentryProject = issue.project?.name || issue.project?.slug || "";
    platform = issue.platform || "";
    sentryIssueId = String(issue.id || issue.issue_id || "");
    sentryCulprit = issue.culprit || "";
    sentryFingerprint = Array.isArray(issue.fingerprint) ? issue.fingerprint.join(":") : "";
  } else if (hookResource === "event_alert" || hookResource === "metric_alert") {
    // Alert rule triggered
    const event = data.event || {};
    const issue = data.issue || event.issue || {};
    errorTitle =
      event.title ||
      issue.title ||
      payload.message ||
      "Sentry Alert";
    errorMessage =
      event.message ||
      event.logentry?.formatted ||
      event.metadata?.value ||
      payload.message ||
      "";
    errorLevel = event.level || issue.level || "error";
    sentryLink = issue.permalink || event.web_url || "";
    sentryProject =
      event.project?.name ||
      event.project?.slug ||
      issue.project?.name ||
      "";
    platform = event.platform || "";
    sentryIssueId = String(issue.id || event.groupID || event.groupId || "");
    sentryCulprit = issue.culprit || event.culprit || "";
    sentryFingerprint = Array.isArray(event.fingerprint)
      ? event.fingerprint.join(":")
      : Array.isArray(issue.fingerprint)
        ? issue.fingerprint.join(":")
        : "";
  } else {
    // Unknown hook type — still try best effort
    errorTitle = payload.message || data.title || "Sentry Notification";
    errorMessage =
      data.message ||
      JSON.stringify(data).substring(0, 500);
    sentryLink = data.url || "";
    sentryIssueId = String(data.issue_id || data.group_id || "");
  }

  const sentryGroupKey = buildSentryGroupKey({
    sentryProject,
    errorTitle,
    errorMessage,
    sentryLink,
    sentryIssueId,
    sentryFingerprint,
    sentryCulprit,
  });

  // Group similar incidents into an existing ticket instead of opening many duplicates.
  const groupedExisting = await prisma.issue.findFirst({
    where: {
      emailThreadId: sentryGroupKey,
    },
    select: { id: true, priority: true },
  });

  if (groupedExisting) {
    if (groupedExisting.priority !== "CRITICAL") {
      await prisma.issue.update({
        where: { id: groupedExisting.id },
        data: { priority: "CRITICAL" },
      });
    }

    await prisma.message.create({
      data: {
        issueId: groupedExisting.id,
        content: [
          `Sentry recurrence detected: ${new Date().toISOString()}`,
          errorMessage ? `Message: ${errorMessage}` : "",
          sentryLink ? `Sentry Link: ${sentryLink}` : "",
          `Grouping key: ${sentryGroupKey}`,
        ]
          .filter(Boolean)
          .join("\n"),
        isFromEmail: false,
      },
    });

    return NextResponse.json({
      ok: true,
      grouped: true,
      message: "Grouped into existing Sentry ticket",
      issueId: groupedExisting.id,
    });
  }

  // Backward-compatible dedup for older tickets created before grouping-key support.
  if (sentryLink) {
    const existing = await prisma.issue.findFirst({
      where: {
        initialNotes: { contains: sentryLink },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        grouped: true,
        message: "Grouped by existing Sentry link",
        issueId: existing.id,
      });
    }
  }

  // Build ticket notes
  const priorityMap: Record<string, string> = {
    fatal: "HIGH",
    error: "HIGH",
    warning: "MEDIUM",
    info: "LOW",
    debug: "LOW",
  };
  const ticketPriority = priorityMap[errorLevel] || "MEDIUM";

  const notes = [
    `**Sentry Error Alert**`,
    ``,
    errorMessage ? `**Error:** ${errorMessage}` : "",
    sentryProject ? `**Project:** ${sentryProject}` : "",
    platform ? `**Platform:** ${platform}` : "",
    errorLevel ? `**Level:** ${errorLevel}` : "",
    sentryLink ? `**Sentry Link:** ${sentryLink}` : "",
    `**Sentry Group Key:** ${sentryGroupKey}`,
    "",
    `*This ticket was automatically created from a Sentry alert.*`,
  ]
    .filter(Boolean)
    .join("\n");

  // Match to a project from project-specific mappings, then global fallback.
  let projectId = await getSetting("SENTRY_DEFAULT_PROJECT_ID");

  if (forcedProjectId) {
    // Use the forced project regardless of ENABLED flag when coming via webhook URL
    // (the URL itself was willingly configured in Sentry by the user)
    projectId = forcedProjectId;
  }

  if (!projectId && sentryProject) {
    const mappings = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: "PROJECT_",
          endsWith: "_SENTRY_PROJECT",
        },
      },
      select: { key: true, value: true },
    });

    const normalizedIncoming = sentryProject.trim().toLowerCase();

    const parseProjectId = (key: string): string | null => {
      const prefix = "PROJECT_";
      const suffix = "_SENTRY_PROJECT";
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;
      return key.slice(prefix.length, key.length - suffix.length) || null;
    };

    const exactMatch = mappings.find((m) => m.value.trim().toLowerCase() === normalizedIncoming);
    const partialMatch = mappings.find((m) => {
      const value = m.value.trim().toLowerCase();
      return value && (normalizedIncoming.includes(value) || value.includes(normalizedIncoming));
    });

    const matched = exactMatch || partialMatch;
    if (matched) {
      const mappedProjectId = parseProjectId(matched.key);
      if (mappedProjectId) {
        const enabled = await getSetting(`PROJECT_${mappedProjectId}_SENTRY_ENABLED`);
        if (enabled === "true") {
          projectId = mappedProjectId;
        }
      }
    }
  }

  if (!projectId && sentryProject) {
    const matchedProject = await prisma.project.findFirst({
      where: {
        projectName: { contains: sentryProject },
        status: "ACTIVE",
      },
    });
    if (matchedProject) projectId = matchedProject.id;
  }

  // Find customer if the project has one
  let customerId: string | null = null;
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { customerId: true },
    });
    if (project?.customerId) customerId = project.customerId;
  }

  // Create ticket
  const subjectTitle = (errorTitle || "Application Error").trim();
  const issue = await prisma.issue.create({
    data: {
      subject: subjectTitle.substring(0, 255),
      initialNotes: notes,
      emailThreadId: sentryGroupKey,
      priority: ticketPriority,
      kind: "BUG",
      projectId: projectId || null,
      customerId: customerId,
      company: sentryProject || null,
    },
  });

  // Create task and assign if we have a project and assignee
  let taskId: string | null = null;
  const projectAssigneeId = projectId ? await getSetting(`PROJECT_${projectId}_SENTRY_ASSIGNEE_ID`) : null;
  const assigneeId = projectAssigneeId || (await getSetting("SENTRY_DEFAULT_ASSIGNEE_ID"));
  const projectAutoTask = projectId ? await getSetting(`PROJECT_${projectId}_SENTRY_AUTO_TASK`) : null;
  const shouldCreateTask = projectAutoTask !== "false";

  if (projectId && shouldCreateTask) {
    const maxOrder = await prisma.task.aggregate({
      where: { projectId },
      _max: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        title: `Fix: ${errorTitle}`.substring(0, 255),
        description: notes,
        priority: ticketPriority,
        projectId,
        issueId: issue.id,
        order: (maxOrder._max.order || 0) + 1,
        assignments: assigneeId
          ? { create: [{ userId: assigneeId }] }
          : undefined,
      },
    });
    taskId = task.id;
  }

  logAudit({
    action: "CREATE",
    entity: "ISSUE",
    entityId: issue.id,
    description: `Sentry webhook created ticket: ${errorTitle}`,
    metadata: {
      source: "sentry",
      sentryProject,
      sentryLink,
      sentryGroupKey,
      errorLevel,
      forcedProjectId,
      taskId,
    },
  });

  return NextResponse.json({
    ok: true,
    issueId: issue.id,
    taskId,
    grouped: false,
  });
}
