/**
 * Tests for email-lock protection on POST /api/registration/[slotId]/step (step 1).
 *
 * Security requirement:
 *   Once a slot has a verified student (slot.studentId is set), submitting step 1
 *   with a DIFFERENT email address must be rejected with 403. This prevents an
 *   unauthorised visitor from swapping the registered email without going through
 *   OTP verification as the original email owner.
 *
 * Scenarios covered:
 *   1. Step 1 with a different email → slot has studentId → 403
 *   2. Step 1 with the same email  → slot has studentId → 200 (OTP sent normally)
 *   3. Step 1 with any email       → slot has no studentId (fresh slot) → 200
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_STAGE_INITIAL_ID,
  WINTER_SLOT_IDS,
  USER_EMMA_ID,
  WINTER_RECRUITMENT_ID,
} from "../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────

const { dbQueue, mockIssueOtp, mockSendOtpEmail } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
  mockIssueOtp: vi.fn().mockResolvedValue({ code: "ABC123", id: "otp-uuid-001" }),
  mockSendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/websocket/events", () => ({
  broadcastSlotStatusUpdate: vi.fn(),
  broadcastRegistrationStepUpdate: vi.fn(),
  broadcastRegistrationUpdate: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { REGISTRATION_STEP_COMPLETED: "step_completed", EMAIL_SENT: "email_sent" },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/auth/hmac", () => ({
  getTeacherPath: (id: string) => `/en/manage/${id}/sig`,
}));

vi.mock("@/lib/auth/otp", () => ({
  issueOtp: mockIssueOtp,
  verifyOtp: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/email/send", () => ({
  sendOtpEmail: mockSendOtpEmail,
  sendRegistrationCompletedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getRegistrationSessionFromRequest: vi.fn().mockResolvedValue({
    userId: undefined,
    email: undefined,
    save: vi.fn(),
  }),
  getSessionFromRequest: vi.fn().mockResolvedValue({
    userId: undefined,
    save: vi.fn(),
  }),
}));

/**
 * Chainable Drizzle-ORM mock — identical pattern to re-edit-bugs.test.ts.
 */
vi.mock("@/db", () => {
  function makeChain(): any {
    const data = dbQueue.shift() ?? [];
    const obj: any = {
      from: () => obj,
      where: () => obj,
      limit: () => obj,
      groupBy: () => obj,
      set: () => obj,
      values: () => obj,
      returning: () => obj,
      innerJoin: () => obj,
      leftJoin: () => obj,
      orderBy: () => obj,
      then(resolve: (v: any) => any, reject?: (e: any) => any) {
        return Promise.resolve(data).then(resolve, reject);
      },
      catch(reject: (e: any) => any) {
        return Promise.resolve(data).catch(reject);
      },
      finally(fn: () => void) {
        return Promise.resolve(data).finally(fn);
      },
      [Symbol.toStringTag]: "DrizzleQuery",
    };
    return obj;
  }
  return {
    db: {
      select: makeChain,
      update: makeChain,
      insert: makeChain,
    },
  };
});

// ── seed-data shortcuts ───────────────────────────────────────────────────────

const SLOT_ID = WINTER_SLOT_IDS[0];
const STAGE_ID = WINTER_STAGE_INITIAL_ID;
const RECRUITMENT_ID = WINTER_RECRUITMENT_ID;
const EMMA_EMAIL = "emma.johnson@student.edu";

// ── request factory ───────────────────────────────────────────────────────────

function makeStep1Request(slotId: string, email: string): NextRequest {
  return new NextRequest(`http://localhost/api/registration/${slotId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      step: 1,
      email,
      emailConsent: true,
      privacyConsent: true,
    }),
  });
}

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * DB calls for step 1 when the slot already has a registered student:
 *   1. select slot   → slot with studentId set
 *   2. select stages → initial stage active (getActiveRegistrationStage)
 *   3. select user   → student with their verified email  ← NEW check
 */
function queueStep1WithExistingStudent(studentEmail: string) {
  dbQueue.push(
    // 1. slot
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registration_started", studentId: USER_EMMA_ID }],
    // 2. initial stage (first query inside getActiveRegistrationStage)
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID }],
    // 3. existing student lookup
    [{ email: studentEmail }],
  );
}

/**
 * DB calls for step 1 when the slot has NO student yet (fresh slot):
 *   1. select slot   → slot without studentId
 *   2. select stages → initial stage active
 *   (no user lookup because studentId is null)
 */
function queueStep1FreshSlot() {
  dbQueue.push(
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "open", studentId: null }],
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID }],
  );
}

// ── import route handler (after mocks are configured) ────────────────────────

import { POST as stepPOST } from "../[slotId]/step/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
  // Re-apply default mock so issueOtp returns consistently
  mockIssueOtp.mockResolvedValue({ code: "ABC123", id: "otp-uuid-001" });
  mockSendOtpEmail.mockResolvedValue(undefined);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Step 1 email-lock – slot already has a registered student", () => {
  it("returns 403 when submitted email differs from the registered student's email", async () => {
    queueStep1WithExistingStudent(EMMA_EMAIL);

    const req = makeStep1Request(SLOT_ID, "attacker@example.com");
    const res = await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/different email/i);

    // OTP must NOT have been issued or sent
    expect(mockIssueOtp).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it("returns 200 and issues an OTP when the submitted email matches the registered student's email", async () => {
    queueStep1WithExistingStudent(EMMA_EMAIL);

    const req = makeStep1Request(SLOT_ID, EMMA_EMAIL);
    const res = await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(200);

    // OTP must have been issued and sent to the correct email
    expect(mockIssueOtp).toHaveBeenCalledOnce();
    expect(mockIssueOtp).toHaveBeenCalledWith(EMMA_EMAIL);
    expect(mockSendOtpEmail).toHaveBeenCalledOnce();
  });

  it("is case-insensitive: mixed-case submission matching the stored email is accepted", async () => {
    queueStep1WithExistingStudent(EMMA_EMAIL);

    const req = makeStep1Request(SLOT_ID, "Emma.Johnson@Student.EDU");
    const res = await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // The check normalises both sides to lowercase, so this must succeed
    expect(res.status).toBe(200);
    expect(mockIssueOtp).toHaveBeenCalledOnce();
  });
});

describe("Step 1 email-lock – fresh slot (no registered student)", () => {
  it("returns 200 and issues an OTP for any email when the slot has no student yet", async () => {
    queueStep1FreshSlot();

    const req = makeStep1Request(SLOT_ID, "newstudent@university.edu");
    const res = await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(200);
    expect(mockIssueOtp).toHaveBeenCalledOnce();
    expect(mockIssueOtp).toHaveBeenCalledWith("newstudent@university.edu");
    expect(mockSendOtpEmail).toHaveBeenCalledOnce();
  });
});
