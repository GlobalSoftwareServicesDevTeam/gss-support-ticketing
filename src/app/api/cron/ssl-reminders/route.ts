import { NextRequest, NextResponse } from "next/server";

// Cron endpoint: process SSL expiry reminders & auto-invoice
// Protected by AUTH_SECRET bearer token
// Delegates to the /api/ssl/reminders POST handler logic
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.AUTH_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Forward to the reminders endpoint as a POST with the cron bearer token
  const baseUrl = req.nextUrl.origin;
  const res = await fetch(`${baseUrl}/api/ssl/reminders`, {
    method: "POST",
    headers: {
      Authorization: authHeader!,
    },
  });

  const data = await res.json();
  return NextResponse.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}
