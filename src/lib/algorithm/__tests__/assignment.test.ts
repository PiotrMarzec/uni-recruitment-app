/**
 * Unit tests for the supplementary-round lock guarantee in runAssignmentAlgorithm.
 *
 * The bug (now fixed):
 *   assign/route.ts resets all stageEnrollments.assignedDestinationId to null before
 *   calling the algorithm. The old algorithm read "locks" from that field on the
 *   current stage — which was always null after the reset, making the lock logic
 *   dead code.
 *
 *   Consequence: students who chose NOT to cancel during the supplementary stage were
 *   guaranteed to keep their destination by policy, but in practice the algorithm
 *   re-entered them into open competition, allowing higher-scoring students to take
 *   their guaranteed seats.
 *
 * The fix:
 *   The algorithm now derives locks from the PREVIOUS supplementary stage's
 *   non-cancelled enrollments + the PREVIOUS admin stage's approved results,
 *   independent of the pre-run reset.
 *
 * Scenarios covered:
 *   1. First admin stage (no supplementary predecessor) — all students assigned fresh.
 *   2. Post-supplementary — a student who kept their assignment is LOCKED and retains
 *      their seat even though a higher-scoring student wants the same destination.
 *   3. Post-supplementary — a cancelled student's slot is freed and won by another
 *      student via the algorithm.
 *   4. Post-supplementary — all students are non-cancelled; all assignments carry
 *      over without re-running the algorithm for any of them.
 *
 * DB call ordering inside runAssignmentAlgorithm (used to build dbQueue):
 *   1.  select stageEnrollments  (current admin stage)
 *   2.  select stage             (current stage info — order, recruitmentId)
 *   3.  select registrations     (joined with users, inArray on registrationIds)
 *   4.  select destinations      (all for this recruitment)
 *   [only when stage.order > 1:]
 *   5.  select stage             (previous stage, order - 1)
 *   [only when previous stage is "supplementary":]
 *   6.  select stageEnrollments  (non-cancelled in the supplementary stage)
 *   [only when nonCancelledIds is non-empty:]
 *   7.  select stage             (admin stage before supplementary, order - 2)
 *   8.  select assignmentResults (approved, dest not null, for nonCancelledIds)
 *   [for each locked student:]
 *   9+. update stageEnrollments  (set assignedDestinationId on the current stage)
 *   [for each newly-assigned student:]
 *   N+. update stageEnrollments  (set assignedDestinationId)
 *   N+1. delete assignmentResults (clear old results for this stage)
 *   N+2. insert assignmentResults (captured via capturedInsertValues)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mock state ─────────────────────────────────────────────────────────

const { dbQueue, capturedInsertValues } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
  /** Rows passed to db.insert(assignmentResults).values([...]) */
  capturedInsertValues: [] as any[],
}));

// ── module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { ASSIGNMENT_COMPUTED: "assignment.computed" },
}));

vi.mock("@/db", () => {
  function makeChain(): any {
    const data = dbQueue.shift() ?? [];
    const obj: any = {
      from: () => obj,
      where: () => obj,
      limit: () => obj,
      orderBy: () => obj,
      set: () => obj,
      values: (v: any) => {
        // Capture rows inserted into assignmentResults
        if (Array.isArray(v)) capturedInsertValues.push(...v);
        return obj;
      },
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
      delete: makeChain,
    },
  };
});

// ── constants ──────────────────────────────────────────────────────────────────

const REC_ID = "rec-00000000-0000-0000-0000-000000000001";

// Stage IDs — orders 1, 2, 3 (initial stage at order 0 is not needed here)
const ADMIN1_ID = "stage-ad1-0000-0000-0000-000000000001"; // order 1
const SUPP_ID   = "stage-sup-0000-0000-0000-000000000001"; // order 2
const ADMIN2_ID = "stage-ad2-0000-0000-0000-000000000001"; // order 3

// Registration IDs
const EMMA_REG   = "reg-000000-0000-0000-0000-000000000001"; // bachelor, non-cancelled → locked
const CARLOS_REG = "reg-000000-0000-0000-0000-000000000002"; // master,   cancelled     → algorithm
const HANS_REG   = "reg-000000-0000-0000-0000-000000000003"; // master,   non-cancelled → algorithm (was unassigned)

// Destination IDs — both use slotsAny so any level can compete for them
const DEST_A = "dest-0000-0000-0000-0000-000000000001"; // Emma's guaranteed seat
const DEST_B = "dest-0000-0000-0000-0000-000000000002"; // freed / contested

// ── factory helpers ────────────────────────────────────────────────────────────

function stage(id: string, order: number, type: "admin" | "supplementary") {
  return { id, type, status: "active", order, recruitmentId: REC_ID };
}

function enrollment(registrationId: string) {
  return { registrationId };
}

function suppEnrollment(registrationId: string) {
  // Non-cancelled supplementary enrollment (cancelled ones are excluded by the DB query)
  return { registrationId };
}

function reg(
  id: string,
  level: string,
  prefs: string[],
  avg: string,
  acts: number,
  letters: number,
) {
  return {
    id,
    studentId: `user-for-${id}`,
    level,
    destinationPreferences: JSON.stringify(prefs),
    averageResult: avg,
    additionalActivities: acts,
    recommendationLetters: letters,
    registrationCompletedAt: new Date("2026-03-10T10:00:00Z"),
    email: `${id}@test.com`,
    fullName: `Student ${id.slice(-4)}`,
  };
}

function dest(id: string, slotsAny: number) {
  return { id, slotsBachelor: 0, slotsMaster: 0, slotsAny };
}

function approvedResult(registrationId: string, destinationId: string, score = "20") {
  return { registrationId, destinationId, score };
}

// ── SUT import (must follow mocks) ────────────────────────────────────────────

import { runAssignmentAlgorithm } from "../assignment";

// ── reset between tests ────────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  capturedInsertValues.length = 0;
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — First admin stage: no supplementary predecessor, fresh assignment
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 1 — first admin stage (order=1): assigns all students fresh", () => {
  /**
   * Two students, two destinations, no supplementary predecessor.
   * stage.order = 1 → the condition `stage.order > 1` is false → the
   * supplementary-lock lookup is never executed.
   *
   * Carlos (score=32) goes first, takes DEST_B (his preference).
   * Emma  (score=20) goes second, takes DEST_A.
   */
  it("assigns both students to their preferred destinations without any locks", async () => {
    dbQueue.push(
      // 1. stageEnrollments for ADMIN1
      [enrollment(EMMA_REG), enrollment(CARLOS_REG)],
      // 2. stage info: order=1 → no supplementary lookup
      [stage(ADMIN1_ID, 1, "admin")],
      // 3. registrations + users
      [
        reg(EMMA_REG,   "bachelor_1", [DEST_A], "5.0", 2, 3),  // score = 3×5+2+3 = 20
        reg(CARLOS_REG, "master_1",   [DEST_B], "6.0", 4, 10), // score = 3×6+4+10 = 32
      ],
      // 4. destinations
      [dest(DEST_A, 1), dest(DEST_B, 1)],
      // — order=1 → stage.order > 1 is FALSE; no steps 5-8 —
      // 5. update Carlos's stageEnrollment (highest score → assigned first)
      [],
      // 6. update Emma's stageEnrollment
      [],
      // 7. delete existing assignmentResults
      [],
      // 8. insert assignmentResults (captured)
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN1_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });
    expect(capturedInsertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ registrationId: EMMA_REG,   destinationId: DEST_A }),
        expect.objectContaining({ registrationId: CARLOS_REG, destinationId: DEST_B }),
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Post-supplementary: non-cancelled student keeps guaranteed seat
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 2 — post-supplementary: non-cancelled student retains guaranteed seat", () => {
  /**
   * Three students enter admin stage 2 (order=3) after a supplementary stage:
   *   Emma   — non-cancelled, had DEST_A assigned and approved in admin1 → LOCKED
   *   Carlos — CANCELLED during supplementary, score=32 (highest), wants DEST_A first
   *   Hans   — non-cancelled, was UNASSIGNED in admin1, score=12, wants DEST_B
   *
   * With the fix:
   *   Emma is locked → DEST_A slot consumed → Carlos can't take it.
   *   Carlos (next highest score) → tries DEST_A (0 slots), falls back to DEST_B ✓
   *   Hans → tries DEST_B (0 slots left) → unassigned.
   *
   * Without the fix (dead lock code):
   *   No locks. Sort order: Carlos(32) > Emma(20) > Hans(12).
   *   Carlos → DEST_A ✗ (takes Emma's guaranteed seat).
   *   Emma → DEST_B.
   *   Hans → unassigned.
   *   The assertion `Emma gets DEST_A` would FAIL.
   */
  it("locks Emma to DEST_A so Carlos cannot take it despite having a higher score", async () => {
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2
      [enrollment(EMMA_REG), enrollment(CARLOS_REG), enrollment(HANS_REG)],
      // 2. stage info: admin2, order=3
      [stage(ADMIN2_ID, 3, "admin")],
      // 3. registrations
      [
        reg(EMMA_REG,   "bachelor_1", [DEST_A, DEST_B], "5.0", 2, 3),  // score=20
        reg(CARLOS_REG, "master_1",   [DEST_A, DEST_B], "6.0", 4, 10), // score=32 (highest)
        reg(HANS_REG,   "master_1",   [DEST_B],          "3.0", 1, 2), // score=12
      ],
      // 4. destinations (slotsAny=1 so either level can compete)
      [dest(DEST_A, 1), dest(DEST_B, 1)],
      // 5. previous stage at order=2 → supplementary
      [stage(SUPP_ID, 2, "supplementary")],
      // 6. non-cancelled supplementary enrollments (Carlos is absent — he cancelled)
      [suppEnrollment(EMMA_REG), suppEnrollment(HANS_REG)],
      // 7. admin stage at order=1 (the one before the supplementary)
      [stage(ADMIN1_ID, 1, "admin")],
      // 8. approved assignments from admin1 for [Emma, Hans]:
      //    Emma had DEST_A; Hans was unassigned (isNotNull filter excludes his row)
      [approvedResult(EMMA_REG, DEST_A, "20")],
      // 9. update Emma's stageEnrollment (locked → set assignedDestinationId = DEST_A)
      [],
      // 10. update Carlos's stageEnrollment (algorithm assigns him DEST_B)
      [],
      // 11. delete existing assignmentResults for ADMIN2
      [],
      // 12. insert assignmentResults (captured)
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 1 });

    // Emma keeps her guaranteed seat.
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: EMMA_REG, destinationId: DEST_A }),
    );

    // Carlos falls back to DEST_B (DEST_A was consumed by Emma's lock).
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: CARLOS_REG, destinationId: DEST_B }),
    );

    // Hans is unassigned (DEST_B was taken by Carlos).
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: HANS_REG, destinationId: undefined }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Cancelled student frees their slot for the algorithm
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 3 — post-supplementary: cancelled student's slot is freed and won by another", () => {
  /**
   * Three students enter admin stage 2 (order=3):
   *   Emma   — non-cancelled, approved at DEST_A in admin1, score=15 → LOCKED
   *   Carlos — CANCELLED, had DEST_B in admin1, score=20, wants DEST_A then DEST_B
   *   Hans   — non-cancelled, was UNASSIGNED in admin1, score=30, wants DEST_B
   *
   * Carlos's cancellation frees DEST_B. Hans (highest-scoring algorithm participant)
   * wins that freed slot.
   *
   * With the fix:
   *   Emma  → DEST_A (locked)
   *   Hans  → DEST_B (freed by Carlos's cancellation, Hans has highest algorithm score)
   *   Carlos → unassigned (both destinations consumed)
   *
   * Without the fix:
   *   Sort: Hans(30) > Carlos(20) > Emma(15). No locks.
   *   Hans  → DEST_B (his preference, still wins).
   *   Carlos → DEST_A ✗ (takes Emma's guaranteed seat).
   *   Emma  → unassigned (loses her guaranteed seat to Carlos).
   */
  it("gives Hans the freed DEST_B slot and preserves Emma's locked DEST_A", async () => {
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2
      [enrollment(EMMA_REG), enrollment(CARLOS_REG), enrollment(HANS_REG)],
      // 2. stage info: admin2, order=3
      [stage(ADMIN2_ID, 3, "admin")],
      // 3. registrations
      [
        reg(EMMA_REG,   "bachelor_1", [DEST_A, DEST_B], "4.0", 1, 2),  // score=15
        reg(CARLOS_REG, "master_1",   [DEST_A, DEST_B], "5.0", 1, 4),  // score=20
        reg(HANS_REG,   "master_1",   [DEST_B],          "6.0", 4, 8), // score=30 (highest)
      ],
      // 4. destinations
      [dest(DEST_A, 1), dest(DEST_B, 1)],
      // 5. previous stage at order=2 → supplementary
      [stage(SUPP_ID, 2, "supplementary")],
      // 6. non-cancelled supplementary enrollments (Carlos is absent — he cancelled)
      [suppEnrollment(EMMA_REG), suppEnrollment(HANS_REG)],
      // 7. admin stage at order=1
      [stage(ADMIN1_ID, 1, "admin")],
      // 8. approved assignments for [Emma, Hans] from admin1:
      //    Emma had DEST_A; Hans was unassigned
      [approvedResult(EMMA_REG, DEST_A, "15")],
      // 9. update Emma's stageEnrollment (locked)
      [],
      // 10. update Hans's stageEnrollment (assigned DEST_B, highest score among runners)
      [],
      // 11. delete
      [],
      // 12. insert (captured)
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 1 });

    // Emma retains her guaranteed seat.
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: EMMA_REG, destinationId: DEST_A }),
    );

    // Hans wins the slot freed by Carlos's cancellation.
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: HANS_REG, destinationId: DEST_B }),
    );

    // Carlos is unassigned (DEST_A consumed by lock, DEST_B taken by Hans).
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: CARLOS_REG, destinationId: undefined }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — All students non-cancelled: full carry-over, algorithm runs for nobody
// ─────────────────────────────────────────────────────────────────────────────

describe("Scenario 4 — all students non-cancelled: every assignment carries over", () => {
  /**
   * Both enrolled students kept their assignments during the supplementary stage.
   * Neither is entered into the assignment algorithm. The only work the algorithm
   * does is emit the locked assignments directly into the results.
   */
  it("carries over both assignments without running the algorithm for anyone", async () => {
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2
      [enrollment(EMMA_REG), enrollment(CARLOS_REG)],
      // 2. stage info: admin2, order=3
      [stage(ADMIN2_ID, 3, "admin")],
      // 3. registrations
      [
        reg(EMMA_REG,   "bachelor_1", [DEST_A], "5.0", 2, 3),  // score=20
        reg(CARLOS_REG, "master_1",   [DEST_B], "6.0", 4, 10), // score=32
      ],
      // 4. destinations
      [dest(DEST_A, 1), dest(DEST_B, 1)],
      // 5. previous stage at order=2 → supplementary
      [stage(SUPP_ID, 2, "supplementary")],
      // 6. non-cancelled supplementary enrollments — BOTH students
      [suppEnrollment(EMMA_REG), suppEnrollment(CARLOS_REG)],
      // 7. admin stage at order=1
      [stage(ADMIN1_ID, 1, "admin")],
      // 8. approved assignments for [Emma, Carlos] from admin1
      [
        approvedResult(EMMA_REG,   DEST_A, "20"),
        approvedResult(CARLOS_REG, DEST_B, "32"),
      ],
      // 9. update Emma's stageEnrollment (locked)
      [],
      // 10. update Carlos's stageEnrollment (locked)
      [],
      // 11. delete (no new algorithm results to replace — but we still clear for idempotency)
      [],
      // 12. insert (captured)
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    // Both locked students count as "assigned"; nobody went through the algorithm.
    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    expect(capturedInsertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ registrationId: EMMA_REG,   destinationId: DEST_A }),
        expect.objectContaining({ registrationId: CARLOS_REG, destinationId: DEST_B }),
      ]),
    );
  });
});
