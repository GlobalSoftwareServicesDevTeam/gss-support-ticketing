import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pollEmails } from "@/lib/email-receiver";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await pollEmails();

  return NextResponse.json({
    success: result.errors.length === 0,
    processed: result.processed,
    errors: result.errors,
    message: result.errors.length
      ? `Processed ${result.processed} email(s). Errors: ${result.errors.join("; ")}`
      : `Processed ${result.processed} email(s).`,
  });
}
