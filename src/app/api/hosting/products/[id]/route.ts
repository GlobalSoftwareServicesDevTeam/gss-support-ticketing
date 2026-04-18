import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

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
    const {
      name, type, description, monthlyPrice, annualPrice, setupFee,
      features, pleskPlanName, sortOrder, isActive, isPopular,
      diskSpace, bandwidth, databases, emailAccounts, emailStorage,
      ftpAccounts, subdomains, sslSupport, phpSupport, backups,
    } = body;

    const product = await prisma.hostingProduct.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) {
      if (!["HOSTING", "SSL", "DOMAIN", "MAIL"].includes(type)) {
        return NextResponse.json({ error: "type must be HOSTING, SSL, DOMAIN, or MAIL" }, { status: 400 });
      }
      data.type = type;
    }
    if (description !== undefined) data.description = description || null;
    if (monthlyPrice !== undefined) data.monthlyPrice = monthlyPrice;
    if (annualPrice !== undefined) data.annualPrice = annualPrice;
    if (setupFee !== undefined) data.setupFee = setupFee;
    if (features !== undefined) data.features = features ? JSON.stringify(features) : null;
    if (pleskPlanName !== undefined) data.pleskPlanName = pleskPlanName || null;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;
    if (isPopular !== undefined) data.isPopular = isPopular;
    if (diskSpace !== undefined) data.diskSpace = diskSpace;
    if (bandwidth !== undefined) data.bandwidth = bandwidth;
    if (databases !== undefined) data.databases = databases;
    if (emailAccounts !== undefined) data.emailAccounts = emailAccounts;
    if (emailStorage !== undefined) data.emailStorage = emailStorage;
    if (ftpAccounts !== undefined) data.ftpAccounts = ftpAccounts;
    if (subdomains !== undefined) data.subdomains = subdomains;
    if (sslSupport !== undefined) data.sslSupport = sslSupport;
    if (phpSupport !== undefined) data.phpSupport = phpSupport;
    if (backups !== undefined) data.backups = backups;

    const updated = await prisma.hostingProduct.update({
      where: { id },
      data,
    });

    logAudit({
      action: "UPDATE",
      entity: "HOSTING_PRODUCT",
      entityId: id,
      description: `Updated hosting product "${product.name}"`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE: remove a hosting product (admin only)
// If the product has orders, it cannot be deleted (use PATCH isActive=false instead)
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

    // Check if any orders reference this product
    const orderCount = await prisma.hostingOrder.count({ where: { productId: id } });
    if (orderCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${orderCount} order(s) reference this product. Deactivate it instead.` },
        { status: 409 }
      );
    }

    await prisma.hostingProduct.delete({ where: { id } });

    logAudit({
      action: "DELETE",
      entity: "HOSTING_PRODUCT",
      entityId: id,
      description: `Permanently deleted hosting product "${product.name}"`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ message: "Product deleted" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
