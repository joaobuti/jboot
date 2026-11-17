// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { parse } from "cookie";

// List all public (non-protected) paths here
const publicPaths = ["/auth", "/auth/login", "/auth/register", "/login"];
const identityLoginUrl = process.env.NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL ?? "http://localhost:3000/login";
const moduleHome: Record<string, string> = {
  pdv: "/pdv",
  juridico: "/juridico",
  flow: "/flow",
};
const modulePathPrefixes: Record<string, string[]> = {
  pdv: ["/pdv", "/dashboard", "/categorias", "/clientes", "/estoque", "/operadores", "/produtos"],
  juridico: ["/juridico"],
  flow: ["/flow"],
};

function getPlatformModule(authUser?: string): string | null {
  if (!authUser) {
    return null;
  }

  try {
    const session = JSON.parse(decodeURIComponent(authUser)) as {
      destination?: { applicationSlug?: string };
    };
    const slug = session.destination?.applicationSlug;
    return slug && slug in modulePathPrefixes ? slug : null;
  } catch {
    return null;
  }
}

function isAllowedPath(moduleSlug: string, pathname: string) {
  return modulePathPrefixes[moduleSlug].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check for auth cookie
  const cookies = parse(req.headers.get("cookie") || "");
  const authUser = cookies["authUser"];
  const platformModule = getPlatformModule(authUser);

  // If the path is public
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // If already authorized, redirect to dashboard
    if (platformModule) {
      return NextResponse.redirect(new URL(moduleHome[platformModule], req.url));
    }
    // Otherwise, allow
    return NextResponse.next();
  }

  // If the path is protected and not authorized, redirect to login
  if (!platformModule) {
    return NextResponse.redirect(identityLoginUrl);
  }

  if (!isAllowedPath(platformModule, pathname)) {
    return NextResponse.redirect(new URL(moduleHome[platformModule], req.url));
  }

  // Otherwise, allow
  return NextResponse.next();
}

// Only match protected routes (as seen in the browser URL)
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/dashboard",
    "/pdv",
    "/pdv/:path*",
    "/categorias",
    "/categorias/:path*",
    "/clientes",
    "/clientes/:path*",
    "/estoque",
    "/estoque/:path*",
    "/operadores",
    "/operadores/:path*",
    "/produtos",
    "/produtos/:path*",
    "/juridico",
    "/juridico/:path*",
    "/flow",
    "/flow/:path*",
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
