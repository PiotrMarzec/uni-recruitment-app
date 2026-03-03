import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { eq, and, gt, lt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars (0,O,I,1,L)

function generateOtpCode(): string {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    code += OTP_ALPHABET[Math.floor(Math.random() * OTP_ALPHABET.length)];
  }
  return code;
}

export async function issueOtp(email: string): Promise<{ code: string; id: string }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const [record] = await db
    .insert(otpCodes)
    .values({ email: email.toLowerCase(), code, expiresAt })
    .returning({ id: otpCodes.id });

  return { code, id: record.id };
}

export async function verifyOtp(
  email: string,
  code: string
): Promise<boolean> {
  const now = new Date();

  const result = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email.toLowerCase()),
        eq(otpCodes.code, code.toUpperCase()),
        gt(otpCodes.expiresAt, now),
        isNull(otpCodes.usedAt)
      )
    )
    .limit(1);

  if (result.length === 0) {
    return false;
  }

  // Mark as used
  await db
    .update(otpCodes)
    .set({ usedAt: now })
    .where(eq(otpCodes.id, result[0].id));

  return true;
}

export async function cleanupExpiredOtps(): Promise<void> {
  const now = new Date();
  await db.delete(otpCodes).where(
    and(
      lt(otpCodes.expiresAt, now)
    )
  );
}
