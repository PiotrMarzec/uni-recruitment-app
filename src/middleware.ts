import createMiddleware from "next-intl/middleware";
import { getIronSession } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

// Pre-compile locale patterns once at module level
const locales = routing.locales.join("|");
const adminProtectedPattern = new RegExp(
  `^/(${locales})/admin(?!/login)(/|$)`
);
const localeExtractPattern = new RegExp(`^/(${locales})/`);

interface MiddlewareSessionData {
  userId?: string;
  isAdmin?: boolean;
}

function getLoginRedirect(request: NextRequest, pathname: string) {
  const localeMatch = pathname.match(localeExtractPattern);
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
  const loginUrl = new URL(`/${locale}/admin/login`, request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a protected admin route
  if (adminProtectedPattern.test(pathname)) {
    const sessionCookie = request.cookies.get("session");

    if (!sessionCookie?.value) {
      return getLoginRedirect(request, pathname);
    }

    // Decrypt and validate the session (no DB hit, just cookie decryption)
    const response = NextResponse.next();
    const session = await getIronSession<MiddlewareSessionData>(
      request,
      response,
      {
        password: process.env.SESSION_SECRET!,
        cookieName: "session",
        cookieOptions: {
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          sameSite: "lax" as const,
        },
      }
    );

    if (!session.isAdmin || !session.userId) {
      return getLoginRedirect(request, pathname);
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
