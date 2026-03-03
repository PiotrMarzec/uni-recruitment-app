import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_EMAIL = "test@example.com";

const { OTP_ID, logAuditEventMock } = vi.hoisted(() => ({
  OTP_ID: "otp-uuid-abcd-1234",
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ users: {}, admins: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

vi.mock("@/lib/auth/otp", () => ({
  issueOtp: vi.fn().mockResolvedValue({ code: "ABC123", id: OTP_ID }),
}));

vi.mock("@/lib/email/send", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: logAuditEventMock,
  ACTIONS: { OTP_ISSUED: "otp.issued" },
  getIpAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST } from "../send/route";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/otp/send", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the otp record uuid (not the email) as audit log resourceId", async () => {
    const res = await POST(makeRequest({ email: TEST_EMAIL, role: "student" }));

    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: OTP_ID, resourceType: "otp" })
    );
  });

  it("never passes the email address as audit log resourceId", async () => {
    await POST(makeRequest({ email: TEST_EMAIL, role: "student" }));

    expect(logAuditEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: TEST_EMAIL })
    );
  });

  it("returns 400 for an invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
