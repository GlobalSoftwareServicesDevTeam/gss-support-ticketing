import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      company: true,
      role: true,
      emailConfirmed: true,
      inviteToken: true,
      createdAt: true,
      _count: { select: { issues: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { username, email, firstName, lastName, password, phoneNumber, company, role } = body;

  if (!username || !email || !firstName || !lastName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existingUser) {
    return NextResponse.json({ error: "User with this email or username already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const activationCode = uuidv4();

  const user = await prisma.user.create({
    data: {
      username,
      email,
      firstName,
      lastName,
      passwordHash,
      phoneNumber,
      company,
      role: role || "USER",
      activationCode,
      emailConfirmed: true, // Admin-created users are pre-verified
    },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, username: user.username },
    { status: 201 }
  );
}
