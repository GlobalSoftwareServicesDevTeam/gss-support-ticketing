import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list hosting products (active only for users, all for admin)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where = session.user.role === "ADMIN" ? {} : { isActive: true };

  const products = await prisma.hostingProduct.findMany({
    where,
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { monthlyPrice: "asc" }],
  });

  return NextResponse.json(products);
}

// POST: create a hosting product (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, type, description, monthlyPrice, setupFee, features, pleskPlanName, sortOrder } = body;

  if (!name || !type || monthlyPrice == null) {
    return NextResponse.json({ error: "name, type, and monthlyPrice are required" }, { status: 400 });
  }

  if (!["HOSTING", "SSL", "DOMAIN"].includes(type)) {
    return NextResponse.json({ error: "type must be HOSTING, SSL, or DOMAIN" }, { status: 400 });
  }

  const product = await prisma.hostingProduct.create({
    data: {
      name,
      type,
      description: description || null,
      monthlyPrice,
      setupFee: setupFee || 0,
      features: features ? JSON.stringify(features) : null,
      pleskPlanName: pleskPlanName || null,
      sortOrder: sortOrder || 0,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
