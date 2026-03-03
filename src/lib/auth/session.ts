import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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
  isAdmin?: boolean;
  pendingEmail?: string;
  emailConsent?: boolean;
  privacyConsent?: boolean;
  pendingSlotId?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-dev-secret-32-characters!!",
  cookieName: "session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getAdminSession(): Promise<IronSession<AdminSessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<AdminSessionData>(
    cookieStore,
    sessionOptions
  );
  return session;
}

export async function getSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<AdminSessionData>> {
  const session = await getIronSession<AdminSessionData>(req, res, sessionOptions);
  return session;
}

export async function getRegistrationSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<RegistrationSessionData>> {
  const session = await getIronSession<RegistrationSessionData>(req, res, sessionOptions);
  return session;
}

export async function requireAdmin(): Promise<AdminSessionData | null> {
  const session = await getAdminSession();
  if (!session.isAdmin || !session.userId) {
    return null;
  }
  return session;
}
