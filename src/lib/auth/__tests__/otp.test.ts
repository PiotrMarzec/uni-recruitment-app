import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockValues, mockReturning } = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "mock-otp-uuid-1234" }]);
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return { mockInsert, mockValues, mockReturning };
});

vi.mock("@/db", () => ({ db: { insert: mockInsert } }));
vi.mock("@/db/schema", () => ({ otpCodes: {} }));

import { issueOtp } from "../otp";

describe("issueOtp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an object with code and id", async () => {
    mockReturning.mockResolvedValue([{ id: "mock-otp-uuid-1234" }]);
    const result = await issueOtp("test@example.com");

    expect(result).toHaveProperty("code");
    expect(result).toHaveProperty("id", "mock-otp-uuid-1234");
    expect(typeof result.code).toBe("string");
    expect(result.code).toHaveLength(6);
  });

  it("stores the email lowercased", async () => {
    mockReturning.mockResolvedValue([{ id: "mock-otp-uuid-1234" }]);
    await issueOtp("TEST@Example.COM");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" })
    );
  });
});
