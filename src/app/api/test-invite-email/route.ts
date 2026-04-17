import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail, contactInviteTemplate } from "@/lib/email";

// POST: send a test invite email to navis@globalsoftwareservices.co.za (admin only)
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const testUrl = "https://support.globalsoftwareservices.co.za/invite?token=PREVIEW_TOKEN";

  await sendEmail({
    to: "navis@globalsoftwareservices.co.za",
    subject: "[TEST] You're invited to the GSS Support Portal",
    html: contactInviteTemplate("Nathan", "Global Software Services", testUrl),
  });

  return NextResponse.json({ message: "Test invite email sent to navis@globalsoftwareservices.co.za" });
}
