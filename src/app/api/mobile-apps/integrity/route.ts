import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isGooglePlayConfigured, decodeIntegrityToken } from "@/lib/google-play";

// POST: verify a Play Integrity token
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { packageName, integrityToken } = body as { packageName: string; integrityToken: string };

  if (!packageName || !integrityToken) {
    return NextResponse.json(
      { error: "packageName and integrityToken are required" },
      { status: 400 }
    );
  }

  try {
    const verdict = await decodeIntegrityToken(packageName, integrityToken);
    return NextResponse.json(verdict);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Integrity verification failed" },
      { status: 500 }
    );
  }
}
