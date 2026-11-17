// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { parse } from "cookie";

// List all public (non-protected) paths here
const publicPaths = ["/login", "/auth", "/auth/login", "/auth/register"];

function hasIdentityAdminSession(authUser?: string) {
  if (!authUser) {
    return false;
  }

  try {
    const session = JSON.parse(decodeURIComponent(authUser)) as {
      destination?: { applicationSlug?: string };
    };
    return session.destination?.applicationSlug === "identity-admin";
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check for auth cookie
  const cookies = parse(req.headers.get("cookie") || "");
  const authUser = cookies["authUser"];
  const isIdentityAdminSession = hasIdentityAdminSession(authUser);

  // If the path is public
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // If already authorized, redirect to dashboard
    if (isIdentityAdminSession) {
      return NextResponse.redirect(new URL("/identity", req.url));
    }
    // Otherwise, allow
    return NextResponse.next();
  }

  // If the path is protected and not authorized, redirect to login
  if (!isIdentityAdminSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Otherwise, allow
  return NextResponse.next();
}

// Only match protected routes (as seen in the browser URL)
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/identity",
    "/identity/:path*",
    "/clientes",
    "/clientes/:path*",
    "/onboarding-clientes",
    "/onboarding-clientes/:path*",
    "/usuarios",
    "/usuarios/:path*",
    "/apps",
    "/apps/:path*",
    "/databases",
    "/databases/:path*",
    "/app-databases",
    "/app-databases/:path*",
    "/dashboard-analytics/:path*",
    "/dashboard-blog/:path*",
    "/dashboard-crm/:path*",
    "/dashboard-job/:path*",
    "/dashboard-nft/:path*",
    "/dashboard-projects/:path*",
    "/profile/:path*",
    "/profile-settings/:path*",
    "/starter/:path*",
    "/terms-condition/:path*",
    "/privacy-policy/:path*",
    "/search-results/:path*",
    "/gallery/:path*",
    "/pricing/:path*",
    "/faqs/:path*",
    "/timeline/:path*",
    "/team/:path*",
    // Add more as needed
  ],
};
