import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listTracks, isGooglePlayConfigured } from "@/lib/google-play";
import { listAppStoreVersions, isAppleConnectConfigured } from "@/lib/apple-connect";
import { sendEmail, buildApprovalTemplate } from "@/lib/email";

// Cron job: check all active apps for build status changes and notify clients
// Protected by AUTH_SECRET bearer token
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.AUTH_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const googleConfigured = await isGooglePlayConfigured();
  const appleConfigured = await isAppleConnectConfigured();

  const apps = await prisma.mobileApp.findMany({
    where: { isActive: true },
    include: {
      customer: {
        include: {
          contacts: {
            where: { isActive: true },
            select: { email: true, name: true },
          },
        },
      },
    },
  });

  const results = {
    checked: 0,
    updated: 0,
    notified: 0,
    errors: [] as string[],
  };

  for (const app of apps) {
    try {
      results.checked++;

      if (app.platform === "GOOGLE_PLAY" && googleConfigured) {
        const packageName = app.packageName || app.bundleId;
        const tracks = await listTracks(packageName);

        for (const track of tracks) {
          for (const release of track.releases || []) {
            for (const versionCode of release.versionCodes || []) {
              let newStatus: string;
              switch (release.status) {
                case "completed": newStatus = "RELEASED"; break;
                case "inProgress": newStatus = "IN_REVIEW"; break;
                case "halted": newStatus = "REJECTED"; break;
                default: continue; // skip drafts
              }

              const existing = await prisma.appBuild.findFirst({
                where: {
                  appId: app.id,
                  buildNumber: versionCode,
                  trackOrChannel: track.track,
                },
              });

              if (existing && existing.status !== newStatus) {
                const shouldNotify =
                  (newStatus === "APPROVED" || newStatus === "RELEASED" || newStatus === "REJECTED") &&
                  !existing.notifiedAt;

                await prisma.appBuild.update({
                  where: { id: existing.id },
                  data: {
                    status: newStatus,
                    ...(newStatus === "RELEASED" ? { releasedAt: new Date() } : {}),
                    ...(newStatus === "REJECTED" ? { reviewedAt: new Date() } : {}),
                    ...(shouldNotify ? { notifiedAt: new Date() } : {}),
                  },
                });
                results.updated++;

                if (shouldNotify) {
                  await notifyContacts(app, existing.version, versionCode, newStatus, track.track);
                  results.notified++;
                }
              } else if (!existing) {
                // New build discovered
                const notes = release.releaseNotes
                  ?.map((n: { language: string; text: string }) => `[${n.language}] ${n.text}`)
                  .join("\n") || null;

                const shouldNotify = newStatus === "RELEASED" || newStatus === "APPROVED" || newStatus === "REJECTED";

                await prisma.appBuild.create({
                  data: {
                    appId: app.id,
                    version: release.name || versionCode,
                    buildNumber: versionCode,
                    status: newStatus,
                    trackOrChannel: track.track,
                    releaseNotes: notes,
                    submittedAt: new Date(),
                    ...(newStatus === "RELEASED" ? { releasedAt: new Date() } : {}),
                    ...(shouldNotify ? { notifiedAt: new Date() } : {}),
                  },
                });
                results.updated++;

                if (shouldNotify) {
                  await notifyContacts(app, release.name || versionCode, versionCode, newStatus, track.track);
                  results.notified++;
                }
              }
            }
          }
        }
      } else if (app.platform === "APPLE" && appleConfigured && app.appleId) {
        const versions = await listAppStoreVersions(app.appleId, 5);

        for (const ver of versions) {
          const state = ver.attributes.appStoreState;
          let newStatus: string;
          switch (state) {
            case "READY_FOR_SALE": newStatus = "RELEASED"; break;
            case "IN_REVIEW": case "WAITING_FOR_REVIEW": newStatus = "IN_REVIEW"; break;
            case "REJECTED": case "METADATA_REJECTED": case "INVALID_BINARY": newStatus = "REJECTED"; break;
            default: continue;
          }

          const existing = await prisma.appBuild.findFirst({
            where: {
              appId: app.id,
              version: ver.attributes.versionString,
              trackOrChannel: "appstore",
            },
          });

          if (existing && existing.status !== newStatus) {
            const shouldNotify =
              (newStatus === "RELEASED" || newStatus === "APPROVED" || newStatus === "REJECTED") &&
              !existing.notifiedAt;

            await prisma.appBuild.update({
              where: { id: existing.id },
              data: {
                status: newStatus,
                ...(newStatus === "RELEASED" ? { releasedAt: new Date() } : {}),
                ...(newStatus === "REJECTED" ? { reviewedAt: new Date() } : {}),
                ...(shouldNotify ? { notifiedAt: new Date() } : {}),
              },
            });
            results.updated++;

            if (shouldNotify) {
              await notifyContacts(app, ver.attributes.versionString, ver.attributes.versionString, newStatus, "appstore");
              results.notified++;
            }
          } else if (!existing) {
            const shouldNotify = newStatus === "RELEASED" || newStatus === "REJECTED";

            await prisma.appBuild.create({
              data: {
                appId: app.id,
                version: ver.attributes.versionString,
                buildNumber: ver.attributes.versionString,
                status: newStatus,
                trackOrChannel: "appstore",
                submittedAt: new Date(ver.attributes.createdDate),
                ...(newStatus === "RELEASED" ? { releasedAt: new Date() } : {}),
                ...(shouldNotify ? { notifiedAt: new Date() } : {}),
              },
            });
            results.updated++;

            if (shouldNotify) {
              await notifyContacts(app, ver.attributes.versionString, ver.attributes.versionString, newStatus, "appstore");
              results.notified++;
            }
          }
        }
      }
    } catch (err) {
      results.errors.push(
        `${app.name} (${app.platform}): ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    timestamp: new Date().toISOString(),
  });
}

interface AppWithCustomer {
  name: string;
  platform: string;
  customer: {
    contacts: { email: string; name: string | null }[];
  };
}

async function notifyContacts(
  app: AppWithCustomer,
  version: string,
  buildNumber: string,
  status: string,
  trackOrChannel: string | null
) {
  const contacts = app.customer?.contacts || [];
  for (const contact of contacts) {
    if (!contact.email) continue;
    try {
      const html = buildApprovalTemplate({
        recipientName: contact.name || "Valued Customer",
        appName: app.name,
        platform: app.platform,
        version,
        buildNumber,
        status,
        trackOrChannel,
      });

      const statusLabel = status === "RELEASED" ? "Released" : status === "APPROVED" ? "Approved" : "Rejected";
      await sendEmail({
        to: contact.email,
        subject: `[GSS] ${app.name} Build ${version} — ${statusLabel}`,
        html,
      });
    } catch {
      // Don't fail the whole cron because of a single email failure
    }
  }
}
