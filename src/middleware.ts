import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { routePermissionMap, hasStaffPermission } from "@/lib/permissions";
import type { StaffPermissions } from "@/lib/permissions";

const CORS_ALLOWED_ORIGINS = [
  "https://globalsoftwareservices.co.za",
  "https://www.globalsoftwareservices.co.za",
];

const PUBLIC_HOSTING_PATHS = [
  "/api/hosting/products/public",
  "/api/hosting/checkout/public",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");
  const corsOrigin =
    origin && CORS_ALLOWED_ORIGINS.includes(origin) ? origin : CORS_ALLOWED_ORIGINS[0];

  // Handle CORS preflight for public hosting routes before auth runs
  const isPublicHosting = PUBLIC_HOSTING_PATHS.some((p) => pathname.startsWith(p));
  if (isPublicHosting) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", corsOrigin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  }

  // Public routes
  const publicRoutes = ["/login", "/register", "/invite", "/sign", "/schedule", "/checkout", "/api/auth", "/api/users/invite/accept", "/api/signing/sign", "/api/schedule"];
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route));

  if (isPublic) return NextResponse.next();

  // API cron routes and payment webhooks use their own auth
  if (pathname.startsWith("/api/cron")) return NextResponse.next();
  if (pathname.startsWith("/api/payments/payfast/notify")) return NextResponse.next();
  if (pathname.startsWith("/api/payments/ozow/notify")) return NextResponse.next();
  if (pathname.startsWith("/api/webhooks/sentry")) return NextResponse.next();
  if (pathname.startsWith("/api/contracts/backfill-documents")) return NextResponse.next();

  // Protect all other routes
  if (!req.auth) {
    // Return JSON 401 for API routes instead of redirecting to login page
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect primary contacts with unsigned contracts to the signing page
  const user = req.auth.user as {
    isPrimaryContact?: boolean;
    hasUnsignedContracts?: boolean;
  } | undefined;
  if (
    user?.isPrimaryContact &&
    user?.hasUnsignedContracts &&
    !pathname.startsWith("/contracts") &&
    !pathname.startsWith("/api/")
  ) {
    return NextResponse.redirect(new URL("/contracts", req.url));
  }

  // Admin/Employee-only routes — check granular permissions
  const staffRoutes = Object.keys(routePermissionMap);
  const matchedRoute = staffRoutes.find((route) => pathname.startsWith(route));

  if (matchedRoute) {
    const requiredPermission = routePermissionMap[matchedRoute];
    const sessionUser = req.auth.user as {
      role?: string;
      staffPermissions?: StaffPermissions;
    } | undefined;

    if (!hasStaffPermission(sessionUser, requiredPermission)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
