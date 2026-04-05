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
    success: true,
    processed: result.processed,
    errors: result.errors,
  });
}
