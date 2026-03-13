/**
 * Reproduces the bug where a student who re-registered during the supplementary
 * stage does NOT receive an assignment email when the subsequent admin stage is
 * approved — even though they received a NEW assigned location.
 *
 * Manually reproducible via:
 *   1. Student completes registration (Admin Stage 1 assigns them to Location A, email sent).
 *   2. Student changes registration via http://192.168.0.239:3000/en/register/<slotId>
 *      during the supplementary stage.
 *   3. Admin Stage 2 runs the assignment algorithm → student is assigned Location B.
 *   4. Admin approves Stage 2 → student should receive email about Location B.
 *      ✗ BUG: email is silently skipped because the student is found in the
 *        `previouslyAssigned` set (they had an approved result in Stage 1).
 *
 * Root cause (approve/route.ts):
 *   The `previouslyAssigned` check queries for any registration that has an
 *   approved assignment result in ANY previous admin stage, and skips the email
 *   for every such registration. It does not account for the case where the
 *   student re-registered AFTER that previous stage ended — which is a different
 *   registration event that warrants a fresh notification.
 *
 * Fix:
 *   When building `previouslyAssigned`, also join `registrations` and the
 *   previous `stages` record to obtain `registrationCompletedAt` and the
 *   previous stage's `endDate`. Only include the registration in the set when
 *   `registrationCompletedAt <= stageEndDate` (i.e. the student did NOT
 *   re-register after the previous stage closed).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_STAGE_ADMIN2_ID,
  WINTER_RECRUITMENT_ID,
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
    name: "Admin User",
    isAdmin: true,
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { ASSIGNMENT_APPROVED: "assignment_approved" },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/email/send", () => ({
  sendAssignmentApprovedEmail: mockSendAssignmentApprovedEmail,
  sendAssignmentUnassignedEmail: mockSendAssignmentUnassignedEmail,
}));

/**
 * Chainable Drizzle-ORM mock — identical pattern to re-edit-bugs.test.ts.
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

const REG_ID = WINTER_REG_IDS[0]; // Emma Johnson's registration

// Timestamps that describe the re-registration scenario:
//   Stage 1 ended on 2026-02-01 → student re-registered on 2026-02-15
//   (registrationCompletedAt > stageEndDate  →  should NOT suppress email)
const STAGE1_END_DATE = new Date("2026-02-01T12:00:00.000Z");
const RE_REGISTRATION_DATE = new Date("2026-02-15T09:00:00.000Z");

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * Queues the seven DB calls made by POST /api/admin/stages/[id]/approve when
 * the stage being approved is Admin Stage 2 and the student previously had an
 * approved assignment in Admin Stage 1 but re-registered afterward.
 *
 * DB call order in approve/route.ts:
 *   1. select stage               (fetch the stage being approved)
 *   2. update assignmentResults   (mark approved = true)
 *   3. update stages              (set status = "completed", endDate = now)
 *   4. select next pending stage  (look for pending stage with higher order)
 *   5. select next supplementary  (look for supplementary stage for email content)
 *   6. select verification stage  (nearest verification stage end date)
 *   7. select results             (assignment results + student + destination info)
 *   8. select previousAssignments (check for prior approved assignments)
 *      The route joins registrations + stages and returns registrationCompletedAt
 *      / stageEndDate so it can detect re-registrations in application code.
 */
function queueApproveStage2WithReRegisteredStudent() {
  dbQueue.push(
    // 1. Current stage (Admin Stage 2)
    [{
      id: WINTER_STAGE_ADMIN2_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 2",
      type: "admin",
      status: "active",
      order: 4,
    }],
    // 2. update assignmentResults → approved = true
    [],
    // 3. update stages → status = "completed"
    [],
    // 4. No next pending stage
    [],
    // 5. No next supplementary stage
    [],
    // 6. No verification stage
    [],
    // 7. Assignment results for this stage: Emma → Berlin
    [{
      id: "result-uuid-0000-0000-0000-000000000001",
      registrationId: REG_ID,
      destinationId: WINTER_DEST_BERLIN_ID,
      score: "85.0",
      studentName: "Emma Johnson",
      studentEmail: "emma.johnson@student.edu",
      studentLocale: "en",
      destinationName: "Berlin University",
      destinationDescription: "A great university in Berlin",
      slotId: WINTER_SLOT_IDS[0],
      spokenLanguages: '["English","German"]',
      averageResult: "4.5",
      recommendationLetters: 2,
      additionalActivities: 3,
    }],
    // 8. Previous approved assignments query.
    //    Emma had an approved result in Admin Stage 1 (destinationId set).
    //    The route reads registrationCompletedAt and stageEndDate from the joined
    //    rows to determine whether the student re-registered.
    //    RE_REGISTRATION_DATE (2026-02-15) > STAGE1_END_DATE (2026-02-01)
    //    → re-registered after stage 1 closed → should NOT be in previouslyAssigned.
    [{
      registrationId: REG_ID,
      registrationCompletedAt: RE_REGISTRATION_DATE,
      stageEndDate: STAGE1_END_DATE,
    }],
  );
}

// ── import route handler (after mocks are set up) ─────────────────────────────

import { POST as approvePOST } from "../approve/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ── Bug: re-registered student does not receive assignment email ───────────────

describe("Bug – approve route skips email for re-registered student with new assignment", () => {
  it("should send sendAssignmentApprovedEmail for a student who re-registered after the previous admin stage ended", async () => {
    queueApproveStage2WithReRegisteredStudent();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/approve`,
      { method: "POST" },
    );
    await approvePOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }) });

    // ✗ CURRENTLY FAILS with the bug:
    //   approve/route.ts lines 81-104 build `previouslyAssigned` from any row in
    //   assignmentResults where stageId != currentStage AND approved = true AND
    //   destinationId IS NOT NULL.  Emma had such a row from Admin Stage 1, so she
    //   is added to the set and her email is skipped — even though she re-registered
    //   after Stage 1 ended and was given a brand-new assignment in Stage 2.
    //
    // ✓ Should pass after fix:
    //   The route joins `registrations` and `stages` so it also fetches
    //   registrationCompletedAt and stageEndDate.  Because
    //   RE_REGISTRATION_DATE (2026-02-15) > STAGE1_END_DATE (2026-02-01) the
    //   student is NOT added to previouslyAssigned and the email is sent.
    expect(mockSendAssignmentApprovedEmail).toHaveBeenCalledOnce();
    expect(mockSendAssignmentApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "emma.johnson@student.edu",
        fullName: "Emma Johnson",
        destinationName: "Berlin University",
      }),
    );
    expect(mockSendAssignmentUnassignedEmail).not.toHaveBeenCalled();
  });
});
