import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const ALLOWED_ORIGINS = [
  "https://globalsoftwareservices.co.za",
  "https://www.globalsoftwareservices.co.za",
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// GET: fetch a single active hosting product (public endpoint - no auth required)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await prisma.hostingProduct.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        monthlyPrice: true,
        annualPrice: true,
        setupFee: true,
        features: true,
        diskSpace: true,
        bandwidth: true,
        databases: true,
        emailAccounts: true,
        emailStorage: true,
        ftpAccounts: true,
        subdomains: true,
        sslSupport: true,
        phpSupport: true,
        backups: true,
        isPopular: true,
        isActive: true,
      },
    });

    const origin = req.headers.get("origin");
    if (!product || !product.isActive) {
      return NextResponse.json({ error: "Product not found" }, { status: 404, headers: corsHeaders(origin) });
    }

    return NextResponse.json({
      ...product,
      features: product.features ? JSON.parse(product.features) : [],
    }, { headers: corsHeaders(origin) });
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
