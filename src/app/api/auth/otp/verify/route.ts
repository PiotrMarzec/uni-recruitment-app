import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyOtp } from "@/lib/auth/otp";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  role: z.enum(["admin", "student"]).default("student"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, code, role } = parsed.data;

  const isValid = await verifyOtp(email, code);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  // Find or create user
  let user = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        fullName: email.split("@")[0], // Temporary name; updated in registration
      })
      .returning();
    user = created;
  }

  // Check if admin
  const isAdmin =
    role === "admin" ||
    (await db
      .select()
      .from(admins)
      .where(eq(admins.userId, user.id))
      .limit(1)
      .then((r) => r.length > 0));

  if (role === "admin" && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Set session
  const res = NextResponse.json({ success: true, userId: user.id, isAdmin });
  const session = await getSessionFromRequest(req, res);
  session.userId = user.id;
  session.email = user.email;
  session.name = user.fullName;
  session.isAdmin = isAdmin;
  await session.save();

  await logAuditEvent({
    actorType: isAdmin ? "admin" : "student",
    actorId: user.id,
    actorLabel: email,
    action: ACTIONS.OTP_VERIFIED,
    resourceType: "user",
    resourceId: user.id,
    details: { role },
    ipAddress: getIpAddress(req),
  });

  return res;
}
