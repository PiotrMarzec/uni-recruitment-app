import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { issueOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/email/send";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { otpSendIpLimiter, otpSendEmailLimiter } from "@/lib/rate-limit";
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
  const ip = getIpAddress(req) ?? "unknown";

  // Rate limit by IP
  const ipCheck = otpSendIpLimiter.check(ip);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(ipCheck.retryAfterMs / 1000)) } }
    );
  }

  // Rate limit by email
  const emailCheck = otpSendEmailLimiter.check(email.toLowerCase());
  if (!emailCheck.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(emailCheck.retryAfterMs / 1000)) } }
    );
  }

  // For admin role: verify email is in admins table
  if (role === "admin") {
    const user = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(admins, eq(users.id, admins.userId))
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json({ error: "No admin account found for this email" }, { status: 404 });
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
    ipAddress: ip,
  });

  return NextResponse.json({ success: true });
}
