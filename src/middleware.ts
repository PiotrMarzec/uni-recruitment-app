import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

// Locales pattern for matching
const locales = routing.locales.join("|");
const adminProtectedPattern = new RegExp(
  `^/(${locales})/admin(?!/login)(/|$)`
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a protected admin route
  if (adminProtectedPattern.test(pathname)) {
    const sessionCookie = request.cookies.get("session");

    if (!sessionCookie?.value) {
      // Determine current locale from path
      const localeMatch = pathname.match(new RegExp(`^/(${locales})/`));
      const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;

      const loginUrl = new URL(`/${locale}/admin/login`, request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico, sitemap.xml, robots.txt (metadata files)
    // - API routes
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/).*)",
  ],
};
