import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail, quoteRequestTemplate } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { projectName, projectType, description, budget, deadline, notes } = body;

    if (!projectName?.trim() || !projectType?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "Project name, type and description are required." }, { status: 400 });
    }

    const userName = session.user.name || session.user.email || "Unknown User";
    const userEmail = session.user.email || "";

    const html = quoteRequestTemplate({
      userName,
      userEmail,
      projectName: projectName.trim(),
      projectType: projectType.trim(),
      description: description.trim(),
      budget: budget?.trim() || undefined,
      deadline: deadline?.trim() || undefined,
      notes: notes?.trim() || undefined,
    });

    await sendEmail({
      to: "navis@globalsoftwareservices.co.za",
      subject: `Quote Request: ${projectName.trim()} — from ${userName}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Quote request error:", error);
    return NextResponse.json({ error: "Failed to send quote request." }, { status: 500 });
  }
}
