/**
 * Verifies that when a supplementary admin stage (an admin stage that follows
 * a supplementary stage) is completed via POST /api/admin/stages/[id]/complete,
 * ALL enrolled students receive an assignment result email — regardless of
 * whether they were previously assigned in an earlier admin stage.
 *
 * Scenario:
 *   Winter recruitment — Admin Stage 2 (order 4) follows Supplementary Stage
 *   (order 3).  Two students are enrolled: Emma (assigned to Berlin) and Carlos
 *   (unassigned).  Emma also had an approved assignment in Admin Stage 1.
 *   Both should receive emails when Admin Stage 2 is completed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_RECRUITMENT_ID,
  WINTER_STAGE_ADMIN2_ID,
  WINTER_STAGE_SUPP_ID,
  WINTER_STAGE_ADMIN1_ID,
  WINTER_REG_IDS,
  WINTER_DEST_BERLIN_ID,
  WINTER_SLOT_IDS,
} from "../../../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────

const { dbQueue, mockSendAssignmentApprovedEmail, mockSendAssignmentUnassignedEmail } =
  vi.hoisted(() => ({
    dbQueue: [] as any[][],
    mockSendAssignmentApprovedEmail: vi.fn(),
    mockSendAssignmentUnassignedEmail: vi.fn(),
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
  ACTIONS: { STAGE_COMPLETED: "stage.completed" },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/email/send", () => ({
  sendAssignmentApprovedEmail: mockSendAssignmentApprovedEmail,
  sendAssignmentUnassignedEmail: mockSendAssignmentUnassignedEmail,
}));

vi.mock("@/lib/auth/hmac", () => ({
  getStudentRegistrationLink: vi.fn().mockReturnValue("https://example.com/register/test"),
}));

/**
 * Chainable Drizzle-ORM mock — same pattern as other test files.
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

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * Queues the DB calls made by POST /api/admin/stages/[id]/complete when the
 * stage being completed is the supplementary admin stage (order 4) with two
 * enrolled students: one assigned and one unassigned.
 *
 * DB call order in complete/route.ts:
 *   1.  select stage               – fetch Admin Stage 2 (supplementary admin stage)
 *   2.  select completedRegistrations – IDs for enrollment
 *   3.  insert stageEnrollments    – enroll first registration
 *   4.  insert stageEnrollments    – enroll second registration
 *   5.  update stages              – mark as completed
 *   6.  update assignmentResults   – auto-approve
 *   7.  select results             – assignment results with student/destination info
 *   8.  select precedingSupplementaryStage – detects this is a supplementary admin stage
 *   9.  select nextSupplementaryStage – no next supplementary stage
 *   10. select nextPendingStage    – no next stage
 *   (no previouslyAssigned query because isSupplementaryAdminStage = true)
 */
function queueSupplementaryAdminStageComplete() {
  dbQueue.push(
    // 1. Current stage — Admin Stage 2 (supplementary admin stage, order 4)
    [{
      id: WINTER_STAGE_ADMIN2_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 2",
      type: "admin",
      status: "active",
      order: 4,
    }],
    // 2. Completed registrations — two students
    [
      { id: WINTER_REG_IDS[0] },
      { id: WINTER_REG_IDS[1] },
    ],
    // 3. Insert enrollment for first registration
    [],
    // 4. Insert enrollment for second registration
    [],
    // 5. Update stage → completed
    [],
    // 6. Update assignmentResults → approved = true
    [],
    // 7. Assignment results: Emma assigned to Berlin, Carlos unassigned
    [
      {
        id: "result-uuid-0000-0000-0000-000000000001",
        registrationId: WINTER_REG_IDS[0],
        destinationId: WINTER_DEST_BERLIN_ID,
        studentName: "Emma Johnson",
        studentEmail: "emma.johnson@student.edu",
        studentLocale: "en",
        destinationName: "Berlin University",
        destinationDescription: "A great university in Berlin",
        slotId: WINTER_SLOT_IDS[0],
      },
      {
        id: "result-uuid-0000-0000-0000-000000000002",
        registrationId: WINTER_REG_IDS[1],
        destinationId: null,
        studentName: "Carlos Garcia",
        studentEmail: "carlos.garcia@student.edu",
        studentLocale: "es",
        destinationName: null,
        destinationDescription: null,
        slotId: WINTER_SLOT_IDS[1],
      },
    ],
    // 8. Preceding supplementary stage exists (order 3) — this is a supplementary admin stage
    [{ id: WINTER_STAGE_SUPP_ID }],
    // 9. No next supplementary stage
    [],
    // 10. No next pending stage
    [],
  );
}

/**
 * Queues calls where Emma was previously assigned in Admin Stage 1, but still
 * receives an email when Admin Stage 2 (supplementary admin stage) completes.
 * Identical to queueSupplementaryAdminStageComplete — there is NO extra
 * previouslyAssigned query because isSupplementaryAdminStage bypasses that check.
 */
function queueSupplementaryAdminStageCompleteWithPreviouslyAssignedStudent() {
  // The DB calls are identical — the previouslyAssigned query is skipped
  // entirely when isSupplementaryAdminStage is true.
  queueSupplementaryAdminStageComplete();
}

// ── import route handler (after mocks are set up) ─────────────────────────────

import { POST as completePOST } from "../complete/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/admin/stages/[id]/complete — supplementary admin stage", () => {
  it("sends assignment emails to all enrolled students (assigned and unassigned)", async () => {
    queueSupplementaryAdminStageComplete();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/complete`,
      { method: "POST" },
    );
    const res = await completePOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }) });

    expect(res.status).toBe(200);
    expect(mockSendAssignmentApprovedEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAssignmentUnassignedEmail).toHaveBeenCalledTimes(1);
  });

  it("sends approved email to assigned student with correct details", async () => {
    queueSupplementaryAdminStageComplete();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/complete`,
      { method: "POST" },
    );
    await completePOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }) });

    expect(mockSendAssignmentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "emma.johnson@student.edu",
        fullName: "Emma Johnson",
        destinationName: "Berlin University",
        locale: "en",
      }),
    );
  });

  it("sends unassigned email to unassigned student with correct details", async () => {
    queueSupplementaryAdminStageComplete();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/complete`,
      { method: "POST" },
    );
    await completePOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }) });

    expect(mockSendAssignmentUnassignedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "carlos.garcia@student.edu",
        fullName: "Carlos Garcia",
        locale: "es",
      }),
    );
  });

  it("does not skip students previously assigned in an earlier admin stage", async () => {
    queueSupplementaryAdminStageCompleteWithPreviouslyAssignedStudent();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/complete`,
      { method: "POST" },
    );
    const res = await completePOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }) });

    expect(res.status).toBe(200);
    // Emma was previously assigned in Admin Stage 1, but still receives an email
    expect(mockSendAssignmentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "emma.johnson@student.edu" }),
    );
  });
});
