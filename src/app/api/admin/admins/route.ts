import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, admins } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { sendAdminInviteEmail } from "@/lib/email/send";
import { z } from "zod";
import { eq } from "drizzle-orm";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      userId: admins.userId,
      fullName: users.fullName,
      email: users.email,
      firstLoginAt: admins.firstLoginAt,
      disabledAt: admins.disabledAt,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .orderBy(users.fullName);

  const result = rows.map((row) => ({
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    status: row.disabledAt
      ? "disabled"
      : row.firstLoginAt
      ? "active"
      : "invited",
  }));

  return NextResponse.json(result);
}

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = inviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, fullName } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Find or create user
  let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, fullName })
      .returning();
  }

  // Check if already an admin
  const [existing] = await db.select().from(admins).where(eq(admins.userId, user.id));
  if (existing) {
    return NextResponse.json({ error: "User is already an admin" }, { status: 409 });
  }

  // Grant admin privileges
  await db.insert(admins).values({ userId: user.id });

  // Build admin panel URL
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const adminUrl = `${appUrl}/admin/login`;

  // Send invite email
  await sendAdminInviteEmail({
    email: normalizedEmail,
    fullName: user.fullName,
    invitedByName: admin.name,
    adminUrl,
  });

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.ADMIN_INVITED,
    resourceType: "admin",
    resourceId: user.id,
    details: { email: normalizedEmail, fullName: user.fullName },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ id: user.id, email: normalizedEmail, fullName: user.fullName }, { status: 201 });
}
