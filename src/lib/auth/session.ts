import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";

let _sessionSecret: string | undefined;

function getSessionSecret(): string {
  if (!_sessionSecret) {
    const value = process.env.SESSION_SECRET;
    if (!value) {
      throw new Error(
        `Missing required environment variable: SESSION_SECRET. ` +
          `Set it in your .env file or environment before starting the application.`
      );
    }
    _sessionSecret = value;
  }
  return _sessionSecret;
}

export interface AdminSessionData {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface RegistrationSessionData {
  userId?: string;
  email?: string;
  name?: string;
  pendingEmail?: string;
  emailConsent?: boolean;
  privacyConsent?: boolean;
  pendingSlotId?: string;
  locale?: string;
}

function getSessionOptions() {
  return {
    password: getSessionSecret(),
    cookieName: "session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

// Separate cookie for student registration sessions so they never collide with
// the admin session. Without this, completing registration step 2 (which sets
// isAdmin: false) would overwrite an admin's session when both are open in the
// same browser.
function getRegistrationSessionOptions() {
  return {
    password: getSessionSecret(),
    cookieName: "reg_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24, // 1 day — registration sessions are short-lived
    },
  };
}

export async function getAdminSession(): Promise<IronSession<AdminSessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(
    cookieStore,
    getSessionOptions()
  );
  return session;
}

export async function getSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<AdminSessionData>> {
  const session = await getIronSession<AdminSessionData>(req, res, getSessionOptions());
  return session;
}

export async function getRegistrationSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<RegistrationSessionData>> {
  const session = await getIronSession<RegistrationSessionData>(req, res, getRegistrationSessionOptions());
  return session;
}

export async function requireAdmin(): Promise<AdminSessionData | null> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.userId) {
    return null;
  }
  // Check that the admin account hasn't been disabled since login
  const [adminRecord] = await db
    .select({ disabledAt: admins.disabledAt })
    .from(admins)
    .where(eq(admins.userId, session.userId));
  if (!adminRecord || adminRecord.disabledAt) {
    return null;
  }
  return session;
}
