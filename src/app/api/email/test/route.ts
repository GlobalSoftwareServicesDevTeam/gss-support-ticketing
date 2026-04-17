import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/settings";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const config = await getSmtpConfig();

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: parseInt(config.SMTP_PORT || "587"),
      secure: config.SMTP_SECURE === "true",
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD,
      },
    });

    await transporter.verify();

    return NextResponse.json({ message: "SMTP connection successful" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `SMTP connection failed: ${message}` }, { status: 500 });
  }
}
