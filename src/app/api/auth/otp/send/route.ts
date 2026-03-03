import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { issueOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/email/send";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "student"]).default("student"),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email, role } = parsed.data;

  // For admin role: verify email is in admins table
  if (role === "admin") {
    const user = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(admins, eq(users.id, admins.userId))
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user.length === 0) {
      // Return same response to prevent email enumeration
      return NextResponse.json({ success: true });
    }
  }

  const { code, id: otpId } = await issueOtp(email);
  await sendOtpEmail(email, code, otpId);

  await logAuditEvent({
    actorType: "system",
    actorLabel: email,
    action: ACTIONS.OTP_ISSUED,
    resourceType: "otp",
    resourceId: otpId,
    details: { role },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
