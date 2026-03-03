import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { lt } from "drizzle-orm";

export async function cleanupOtps(): Promise<void> {
  const now = new Date();
  const deleted = await db
    .delete(otpCodes)
    .where(lt(otpCodes.expiresAt, now));

  console.log(`[OTP Cleanup] Deleted expired OTP codes`);
}
