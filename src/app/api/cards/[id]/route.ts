import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH: update card (nickname, default)
export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json();

  const card = await prisma.savedCard.findFirst({
    where: { id, userId: session.user.id, isActive: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.nickname !== undefined) updateData.nickname = body.nickname;

  if (body.isDefault === true) {
    // Unset default for all other cards first
    await prisma.savedCard.updateMany({
      where: { userId: session.user.id, isDefault: true },
      data: { isDefault: false },
    });
    updateData.isDefault = true;
  }

  const updated = await prisma.savedCard.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      gateway: true,
      cardBrand: true,
      last4: true,
      expiryMonth: true,
      expiryYear: true,
      nickname: true,
      isDefault: true,
    },
  });

  return NextResponse.json(updated);
}

// DELETE: deactivate a saved card
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const card = await prisma.savedCard.findFirst({
    where: { id, userId: session.user.id, isActive: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  await prisma.savedCard.update({
    where: { id },
    data: { isActive: false, isDefault: false },
  });

  return NextResponse.json({ message: "Card removed" });
}
