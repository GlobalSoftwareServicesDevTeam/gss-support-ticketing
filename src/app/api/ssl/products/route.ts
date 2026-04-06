import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listProducts, DIGICERT_PRODUCTS } from "@/lib/digicert";

// GET: list available DigiCert SSL products
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const dcProducts = await listProducts();
    return NextResponse.json(dcProducts);
  } catch {
    // If API call fails, return static product list
    return NextResponse.json({
      products: Object.values(DIGICERT_PRODUCTS),
    });
  }
}
