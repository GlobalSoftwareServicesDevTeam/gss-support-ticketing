import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes
  const publicRoutes = ["/login", "/register", "/invite", "/sign", "/schedule", "/api/auth", "/api/users/invite/accept", "/api/signing/sign", "/api/schedule"];
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route));

  if (isPublic) return NextResponse.next();

  // API cron routes and payment webhooks use their own auth
  if (pathname.startsWith("/api/cron")) return NextResponse.next();
  if (pathname.startsWith("/api/payments/payfast/notify")) return NextResponse.next();
  if (pathname.startsWith("/api/payments/ozow/notify")) return NextResponse.next();

  // Protect all other routes
  if (!req.auth) {
    // Return JSON 401 for API routes instead of redirecting to login page
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  const adminRoutes = ["/users", "/email-settings", "/flagged-emails", "/signing", "/task-schedule", "/code-downloads", "/hosting-admin"];
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  if (isAdminRoute && req.auth.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
