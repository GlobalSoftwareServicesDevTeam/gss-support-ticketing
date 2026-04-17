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

// GET: list active hosting products (public endpoint - no authentication required)
export async function GET(req: NextRequest) {
  try {
    const products = await prisma.hostingProduct.findMany({
      where: {
        isActive: true,
      },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { monthlyPrice: "asc" }],
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
        sortOrder: true,
      },
    });

    // Parse features JSON if it exists
    const parsedProducts = products.map((p) => ({
      ...p,
      features: p.features ? JSON.parse(p.features) : [],
    }));

    const origin = req.headers.get("origin");
    return NextResponse.json(parsedProducts, { headers: corsHeaders(origin) });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// Enable CORS for this endpoint
export const dynamic = "force-dynamic";
