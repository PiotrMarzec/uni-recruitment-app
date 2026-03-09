import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRegistrationSessionFromRequest } from "@/lib/auth/session";
import { z } from "zod";

const SUPPORTED_LOCALES = ["en", "pl", "de", "fr", "es", "it"] as const;

const schema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  await params; // slotId not needed but must be awaited in Next.js 15

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const { locale } = parsed.data;

  const res = NextResponse.json({ success: true });
  const session = await getRegistrationSessionFromRequest(req, res);

  if (!session.userId) {
    // No authenticated session — nothing to update in the DB
    return res;
  }

  await db.update(users).set({ locale }).where(eq(users.id, session.userId));

  res.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
