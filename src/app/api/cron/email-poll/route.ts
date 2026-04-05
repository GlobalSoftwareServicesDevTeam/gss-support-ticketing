import { NextRequest, NextResponse } from "next/server";
import { pollEmails } from "@/lib/email-receiver";

// This endpoint can be called by a cron job (e.g., Vercel Cron, external cron service)
// to periodically check for new emails.
// Secure it with a secret token in production.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.AUTH_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pollEmails();

  return NextResponse.json({
    success: true,
    processed: result.processed,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}
