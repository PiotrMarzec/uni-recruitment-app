import { createHmac, timingSafeEqual } from "crypto";

let _hmacSecret: string | undefined;

function getHmacSecret(): string {
  if (!_hmacSecret) {
    const value = process.env.HMAC_SECRET;
    if (!value) {
      throw new Error(
        `Missing required environment variable: HMAC_SECRET. ` +
          `Set it in your .env file or environment before starting the application.`
      );
    }
    _hmacSecret = value;
  }
  return _hmacSecret;
}

export function signTeacherLink(slotId: string): string {
  const hmac = createHmac("sha256", getHmacSecret());
  hmac.update(slotId);
  return hmac.digest("hex").slice(0, 32); // 32-char hex signature
}

export function verifyTeacherSignature(
  slotId: string,
  signature: string
): boolean {
  const expected = signTeacherLink(slotId);
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

export function getTeacherLink(slotId: string): string {
  const sig = signTeacherLink(slotId);
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/en/manage/${slotId}/${sig}`;
}

export function getTeacherPath(slotId: string): string {
  const sig = signTeacherLink(slotId);
  return `/en/manage/${slotId}/${sig}`;
}

export function getStudentRegistrationLink(slotId: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/register/${slotId}`;
}
