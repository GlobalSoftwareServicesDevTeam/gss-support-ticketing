import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { listTracks, isGooglePlayConfigured } from "@/lib/google-play";
import { listBuilds as listAppleBuilds, listAppStoreVersions, isAppleConnectConfigured } from "@/lib/apple-connect";

// POST: sync builds from Google Play / Apple for a specific app
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await prisma.mobileApp.findUnique({ where: { id } });
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const results: { synced: number; errors: string[] } = { synced: 0, errors: [] };

  try {
    if (app.platform === "GOOGLE_PLAY") {
      if (!(await isGooglePlayConfigured())) {
        return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
      }

      const packageName = app.packageName || app.bundleId;
      const tracks = await listTracks(packageName);

      for (const track of tracks) {
        for (const release of track.releases || []) {
          for (const versionCode of release.versionCodes || []) {
            let status: string;
            switch (release.status) {
              case "completed": status = "RELEASED"; break;
              case "inProgress": status = "IN_REVIEW"; break;
              case "draft": status = "SUBMITTED"; break;
              case "halted": status = "REJECTED"; break;
              default: status = "SUBMITTED";
            }

            // Check if build already exists
            const existing = await prisma.appBuild.findFirst({
              where: {
                appId: id,
                buildNumber: versionCode,
                trackOrChannel: track.track,
              },
            });

            if (existing) {
              if (existing.status !== status) {
                await prisma.appBuild.update({
                  where: { id: existing.id },
                  data: {
                    status,
                    ...(status === "RELEASED" ? { releasedAt: new Date() } : {}),
                    ...(status === "APPROVED" || status === "REJECTED" ? { reviewedAt: new Date() } : {}),
                  },
                });
                results.synced++;
              }
            } else {
              const notes = release.releaseNotes
                ?.map((n: { language: string; text: string }) => `[${n.language}] ${n.text}`)
                .join("\n") || null;

              await prisma.appBuild.create({
                data: {
                  appId: id,
                  version: release.name || versionCode,
                  buildNumber: versionCode,
                  status,
                  trackOrChannel: track.track,
                  releaseNotes: notes,
                  submittedAt: new Date(),
                  ...(status === "RELEASED" ? { releasedAt: new Date() } : {}),
                },
              });
              results.synced++;
            }
          }
        }
      }
    } else if (app.platform === "APPLE") {
      if (!(await isAppleConnectConfigured())) {
        return NextResponse.json({ error: "Apple App Store Connect not configured" }, { status: 400 });
      }

      if (!app.appleId) {
        return NextResponse.json({ error: "Apple App ID not set for this app" }, { status: 400 });
      }

      // Sync builds
      const builds = await listAppleBuilds(app.appleId, 50);
      for (const build of builds) {
        const existing = await prisma.appBuild.findFirst({
          where: {
            appId: id,
            buildNumber: build.attributes.version,
          },
        });

        let status = "SUBMITTED";
        if (build.attributes.processingState === "VALID") status = "APPROVED";
        else if (build.attributes.processingState === "INVALID" || build.attributes.processingState === "FAILED") status = "REJECTED";

        if (!existing) {
          await prisma.appBuild.create({
            data: {
              appId: id,
              version: build.attributes.version,
              buildNumber: build.attributes.version,
              status,
              submittedAt: new Date(build.attributes.uploadedDate),
              ...(status === "APPROVED" ? { reviewedAt: new Date(build.attributes.uploadedDate) } : {}),
            },
          });
          results.synced++;
        } else if (existing.status !== status) {
          await prisma.appBuild.update({
            where: { id: existing.id },
            data: {
              status,
              ...(status === "APPROVED" ? { reviewedAt: new Date() } : {}),
            },
          });
          results.synced++;
        }
      }

      // Sync app store versions (submission statuses)
      const versions = await listAppStoreVersions(app.appleId, 10);
      for (const ver of versions) {
        const state = ver.attributes.appStoreState;
        let status: string;
        switch (state) {
          case "READY_FOR_SALE": status = "RELEASED"; break;
          case "IN_REVIEW": case "WAITING_FOR_REVIEW": status = "IN_REVIEW"; break;
          case "REJECTED": case "METADATA_REJECTED": case "INVALID_BINARY": status = "REJECTED"; break;
          case "DEVELOPER_REJECTED": status = "REJECTED"; break;
          default: status = "SUBMITTED";
        }

        const existing = await prisma.appBuild.findFirst({
          where: {
            appId: id,
            version: ver.attributes.versionString,
            trackOrChannel: "appstore",
          },
        });

        if (!existing) {
          await prisma.appBuild.create({
            data: {
              appId: id,
              version: ver.attributes.versionString,
              buildNumber: ver.attributes.versionString,
              status,
              trackOrChannel: "appstore",
              submittedAt: new Date(ver.attributes.createdDate),
              ...(status === "RELEASED" ? { releasedAt: new Date() } : {}),
              ...(status === "REJECTED" ? { reviewedAt: new Date() } : {}),
            },
          });
          results.synced++;
        } else if (existing.status !== status) {
          await prisma.appBuild.update({
            where: { id: existing.id },
            data: {
              status,
              ...(status === "RELEASED" ? { releasedAt: new Date() } : {}),
              ...(status === "REJECTED" || status === "IN_REVIEW" ? { reviewedAt: new Date() } : {}),
            },
          });
          results.synced++;
        }
      }
    }
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : "Unknown error");
  }

  return NextResponse.json(results);
}
