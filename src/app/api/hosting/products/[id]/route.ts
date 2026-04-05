import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PATCH: update a hosting product (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, type, description, monthlyPrice, setupFee, features, pleskPlanName, sortOrder, isActive } = body;

    const product = await prisma.hostingProduct.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) {
      if (!["HOSTING", "SSL", "DOMAIN"].includes(type)) {
        return NextResponse.json({ error: "type must be HOSTING, SSL, or DOMAIN" }, { status: 400 });
      }
      data.type = type;
    }
    if (description !== undefined) data.description = description || null;
    if (monthlyPrice !== undefined) data.monthlyPrice = monthlyPrice;
    if (setupFee !== undefined) data.setupFee = setupFee;
    if (features !== undefined) data.features = features ? JSON.stringify(features) : null;
    if (pleskPlanName !== undefined) data.pleskPlanName = pleskPlanName || null;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.hostingProduct.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE: deactivate a hosting product (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const product = await prisma.hostingProduct.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Soft-delete: set isActive to false
    await prisma.hostingProduct.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Product deactivated" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
