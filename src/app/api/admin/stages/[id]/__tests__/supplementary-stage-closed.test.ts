/**
 * Verifies that when a supplementary stage is ended early via
 * POST /api/admin/stages/[id]/end, every student with a completed registration
 * receives a `sendSupplementaryStageClosedEmail` notification that includes the
 * subsequent admin stage's end date.
 *
 * Scenario:
 *   Winter recruitment — supplementary stage (order 3) is active.
 *   Admin triggers "end" → stage is marked completed, next admin stage (order 4)
 *   is activated, and all students with completed registrations receive an email
 *   telling them the supplementary period has closed and when to expect results.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_RECRUITMENT_ID,
  WINTER_STAGE_SUPP_ID,
  WINTER_STAGE_ADMIN2_ID,
  WINTER_REG_IDS,
} from "../../../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────

const { dbQueue, mockSendSupplementaryStageClosedEmail } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
  mockSendSupplementaryStageClosedEmail: vi.fn(),
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    userId: "admin-uuid-0000-0000-0000-000000000001",
    email: "admin@example.com",
    isAdmin: true,
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { STAGE_TRANSITIONED: "stage.transitioned" },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/email/send", () => ({
  sendSupplementaryStageClosedEmail: mockSendSupplementaryStageClosedEmail,
  sendInitialStageClosedEmail: vi.fn(),
  sendSupplementaryStageEmail: vi.fn(),
}));

vi.mock("@/lib/auth/hmac", () => ({
  getStudentRegistrationLink: vi.fn().mockReturnValue("https://example.com/register/test"),
}));

/**
 * Chainable Drizzle-ORM mock — same pattern as approve-re-registration.test.ts.
 * Each db.select() / db.update() / db.insert() call consumes the next entry
 * from dbQueue.
 */
vi.mock("@/db", () => {
  function makeChain(): any {
    const data = dbQueue.shift() ?? [];
    const obj: any = {
      from: () => obj,
      where: () => obj,
      limit: () => obj,
      orderBy: () => obj,
      set: () => obj,
      values: () => obj,
      returning: () => obj,
      innerJoin: () => obj,
      leftJoin: () => obj,
      onConflictDoNothing: () => obj,
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

// ── constants ─────────────────────────────────────────────────────────────────

const ADMIN2_END_DATE = new Date("2026-04-15T12:00:00.000Z");

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * Queues the eight DB calls made by POST /api/admin/stages/[id]/end when the
 * stage being ended is the supplementary stage and there is a subsequent admin
 * stage pending.
 *
 * DB call order in end/route.ts:
 *   1. select stage               – fetch the supplementary stage being ended
 *   2. update stages              – set endDate = now, status = "completed"
 *   3. select next pending stage  – find the next stage by order
 *   4. update stages              – activate the next stage
 *   5. select completedRegistrations – IDs only, for enrollment inserts
 *   6. insert stageEnrollments    – enroll first registration in next stage
 *   7. insert stageEnrollments    – enroll second registration in next stage
 *   8. select enrolledStudents    – email / fullName / locale for email dispatch
 */
function queueSupplementaryStageEnd() {
  dbQueue.push(
    // 1. Current stage – supplementary, order 3
    [{
      id: WINTER_STAGE_SUPP_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Supplementary Stage",
      type: "supplementary",
      status: "active",
      order: 3,
    }],
    // 2. update stages → completed
    [],
    // 3. Next pending stage – admin, order 4
    [{
      id: WINTER_STAGE_ADMIN2_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 2",
      type: "admin",
      status: "pending",
      order: 4,
      endDate: ADMIN2_END_DATE,
    }],
    // 4. update stages → activated
    [],
    // 5. Completed registrations – two students enrolled
    [
      { id: WINTER_REG_IDS[0] },
      { id: WINTER_REG_IDS[1] },
    ],
    // 6. Insert enrollment for first registration
    [],
    // 7. Insert enrollment for second registration
    [],
    // 8. Enrolled students with contact details for email dispatch
    [
      { email: "emma.johnson@student.edu", fullName: "Emma Johnson", locale: "en" },
      { email: "carlos.garcia@student.edu", fullName: "Carlos Garcia", locale: "es" },
    ],
  );
}

/**
 * Queues calls for the case where the supplementary stage is the last stage
 * (no next pending stage exists). No enrollment or email dispatching occurs.
 *
 * DB call order:
 *   1. select stage
 *   2. update stages → completed
 *   3. select next pending stage → empty (no next stage)
 */
function queueSupplementaryStageEndNoNextStage() {
  dbQueue.push(
    // 1. Current stage – supplementary, order 3
    [{
      id: WINTER_STAGE_SUPP_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Supplementary Stage",
      type: "supplementary",
      status: "active",
      order: 3,
    }],
    // 2. update stages → completed
    [],
    // 3. No next pending stage
    [],
  );
}

// ── import route handler (after mocks are set up) ─────────────────────────────

import { POST as endPOST } from "../end/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/admin/stages/[id]/end — supplementary stage closed notification", () => {
  it("sends sendSupplementaryStageClosedEmail to every student with a completed registration", async () => {
    queueSupplementaryStageEnd();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_SUPP_ID}/end`,
      { method: "POST" },
    );
    const res = await endPOST(req, { params: Promise.resolve({ id: WINTER_STAGE_SUPP_ID }) });

    expect(res.status).toBe(200);
    expect(mockSendSupplementaryStageClosedEmail).toHaveBeenCalledTimes(2);
  });

  it("includes each student's name, email, locale, and the next admin stage end date", async () => {
    queueSupplementaryStageEnd();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_SUPP_ID}/end`,
      { method: "POST" },
    );
    await endPOST(req, { params: Promise.resolve({ id: WINTER_STAGE_SUPP_ID }) });

    expect(mockSendSupplementaryStageClosedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "emma.johnson@student.edu",
        fullName: "Emma Johnson",
        locale: "en",
        recruitmentName: "Supplementary recruitment stage #1",
        adminStageEndDate: ADMIN2_END_DATE,
      }),
    );
    expect(mockSendSupplementaryStageClosedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "carlos.garcia@student.edu",
        fullName: "Carlos Garcia",
        locale: "es",
        recruitmentName: "Supplementary recruitment stage #1",
        adminStageEndDate: ADMIN2_END_DATE,
      }),
    );
  });

  it("does not send supplementary stage closed emails when there is no subsequent stage", async () => {
    queueSupplementaryStageEndNoNextStage();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_SUPP_ID}/end`,
      { method: "POST" },
    );
    const res = await endPOST(req, { params: Promise.resolve({ id: WINTER_STAGE_SUPP_ID }) });

    expect(res.status).toBe(200);
    expect(mockSendSupplementaryStageClosedEmail).not.toHaveBeenCalled();
  });
});
