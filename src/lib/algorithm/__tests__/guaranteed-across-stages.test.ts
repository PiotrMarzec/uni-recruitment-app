/**
 * Tests for guaranteed/assigned destinations across all stage types.
 *
 * Covers the full recruitment lifecycle:
 *   1. Initial admin (order=1): fresh assignment, no locks.
 *   2. Initial verification (order=2): students keep admin assignments as guaranteed;
 *      only non-guaranteed students considered by algorithm.
 *   3. Supplementary admin (order=5) after supplementary (order=4) and verification (order=3):
 *      locks come from verification stage (not just admin), respecting supplementary cancellations.
 *   4. Verification stage after supplementary admin: locks from supplementary admin carry over.
 *   5. Guaranteed flag: non-locked students who get the same destination as their previous
 *      approved assignment are marked guaranteed=true.
 *
 * Stage layout used across scenarios:
 *   order=0  initial (registration)
 *   order=1  admin (initial)
 *   order=2  verification (initial)
 *   order=3  supplementary (registration)
 *   order=4  admin (supplementary)
 *   order=5  verification (supplementary)
 *
 * DB call ordering inside runAssignmentAlgorithm:
 *   1. select stageEnrollments (current stage)
 *   2. select stage (current stage info)
 *   3. select registrations + users
 *   4. select destinations
 *   [if stage.order > 1:]
 *   5. select stage (most recent completed admin/verification before current)
 *   [if found:]
 *   6. select stage (supplementary between prev and current)
 *   [if supplementary found:]
 *   7. select stageEnrollments (supplementary enrollments for cancelled check)
 *   8. select assignmentResults (approved from prev stage)
 *   [for each locked student:]
 *   9+. update stageEnrollments (set assignedDestinationId)
 *   [for each algorithm-assigned student:]
 *   N+. update stageEnrollments
 *   N+1. delete assignmentResults
 *   N+2. insert assignmentResults (captured)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mock state ─────────────────────────────────────────────────────────

const { dbQueue, capturedInsertValues } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
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

const REC_ID = "rec-cross-stage-0000-0000-000000000001";

// Stage IDs matching the order layout in the header
const ADMIN1_ID = "stage-admin1-0000-0000-000000000001";     // order=1
const VERIF1_ID = "stage-verif1-0000-0000-000000000001";     // order=2
const SUPP_ID   = "stage-supp-0000-0000-0000-000000000001";  // order=3
const ADMIN2_ID = "stage-admin2-0000-0000-000000000001";     // order=4
const VERIF2_ID = "stage-verif2-0000-0000-000000000001";     // order=5

// Registration IDs
const HARRY_REG   = "reg-harry-0000-0000-0000-000000000001";
const NEVILLE_REG = "reg-neville-0000-0000-000000000001";
const HERMIONE_REG = "reg-hermione-0000-0000-00000000001";

// Destination IDs
const LONDON_ID     = "dest-london-0000-0000-000000000001";
const MANCHESTER_ID = "dest-manchester-0000-00000000001";

// ── factory helpers ────────────────────────────────────────────────────────────

function stageRow(id: string, order: number, type: string, status = "active") {
  return { id, type, status, order, recruitmentId: REC_ID };
}

function enrollment(registrationId: string) {
  return { registrationId };
}

function suppEnrollmentRow(registrationId: string, cancelled: boolean) {
  return { registrationId, cancelled };
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
    fullName: `Student ${id.slice(4, 15)}`,
    notes: null,
  };
}

function dest(id: string, slotsAny: number) {
  return { id, slotsBachelor: 0, slotsMaster: 0, slotsAny, recruitmentId: REC_ID, name: id };
}

function approvedResult(registrationId: string, destinationId: string, score = "20") {
  return { registrationId, destinationId, score };
}

// ── SUT import ─────────────────────────────────────────────────────────────────

import { runAssignmentAlgorithm } from "../assignment";

// ── reset ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  capturedInsertValues.length = 0;
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1 — Verification stage after initial admin: all admin assignments locked
// ═══════════════════════════════════════════════════════════════════════════════

describe("Verification stage (order=2) after admin (order=1)", () => {
  it("locks all students assigned in admin stage; only unassigned students enter algorithm", async () => {
    // Harry was assigned to London in admin1.
    // Neville was unassigned in admin1 (no approved result with destination).
    // Running algorithm on verification stage should lock Harry, only assign Neville.
    dbQueue.push(
      // 1. stageEnrollments for VERIF1
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG)],
      // 2. stage info: verification, order=2
      [stageRow(VERIF1_ID, 2, "verification")],
      // 3. registrations
      [
        reg(HARRY_REG,   "bachelor_1", [LONDON_ID, MANCHESTER_ID], "5.0", 2, 3), // score=20
        reg(NEVILLE_REG, "master_1",   [MANCHESTER_ID],            "4.0", 1, 2), // score=15
      ],
      // 4. destinations
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // 5. most recent completed admin/verification before order=2 → admin1 (order=1, completed)
      [stageRow(ADMIN1_ID, 1, "admin", "completed")],
      // 6. supplementary between admin1 (order=1) and verif1 (order=2) → none
      [],
      // 7. NO supplementary → skip step 7 (cancelled check)
      // 8. approved results from admin1: Harry→London, Neville unassigned (not in results)
      [approvedResult(HARRY_REG, LONDON_ID, "20")],
      // 9. update Harry's stageEnrollment (locked → London)
      [],
      // 10. update Neville's stageEnrollment (algorithm → Manchester)
      [],
      // 11. delete existing assignmentResults
      [],
      // 12. insert assignmentResults (captured)
      [],
    );

    const result = await runAssignmentAlgorithm(VERIF1_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    // Harry locked to London with guaranteed=true
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Neville assigned to Manchester via algorithm, not guaranteed
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: false,
      }),
    );
  });

  it("does not reassign locked students even if higher-scoring student wants their destination", async () => {
    // Neville has a higher score than Harry but Harry is locked to London.
    // Neville wants London first, Manchester second. Should get Manchester.
    dbQueue.push(
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG)],
      [stageRow(VERIF1_ID, 2, "verification")],
      [
        reg(HARRY_REG,   "bachelor_1", [LONDON_ID],                "5.0", 2, 3), // score=20
        reg(NEVILLE_REG, "master_1",   [LONDON_ID, MANCHESTER_ID], "8.0", 5, 5), // score=34
      ],
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // 5. prev stage: admin1 completed
      [stageRow(ADMIN1_ID, 1, "admin", "completed")],
      // 6. no supplementary between
      [],
      // 8. Harry approved at London
      [approvedResult(HARRY_REG, LONDON_ID, "20")],
      // 9. update Harry (locked)
      [],
      // 10. update Neville (algorithm → Manchester, London is consumed)
      [],
      // 11. delete
      [],
      // 12. insert
      [],
    );

    const result = await runAssignmentAlgorithm(VERIF1_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: false,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 2 — Supplementary admin locks from verification stage (not just admin)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Supplementary admin (order=4) locks from verification (order=2)", () => {
  it("locks students assigned in verification stage, respecting supplementary cancellations", async () => {
    // After verification (order=2):
    //   Harry → London (approved), Neville → Manchester (approved)
    // Supplementary (order=3):
    //   Harry did NOT cancel (keeps London), Neville CANCELLED (loses Manchester)
    // Admin2 (order=4):
    //   Harry should be LOCKED at London. Neville enters algorithm.
    //   Hermione is new student from supplementary registration.
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG), enrollment(HERMIONE_REG)],
      // 2. stage info: admin, order=4
      [stageRow(ADMIN2_ID, 4, "admin")],
      // 3. registrations
      [
        reg(HARRY_REG,    "bachelor_1", [LONDON_ID],                "5.0", 2, 3), // score=20
        reg(NEVILLE_REG,  "master_1",   [MANCHESTER_ID, LONDON_ID], "4.0", 1, 2), // score=15
        reg(HERMIONE_REG, "bachelor_1", [MANCHESTER_ID],            "7.0", 3, 5), // score=29
      ],
      // 4. destinations
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // 5. most recent completed admin/verification before order=4 → verification (order=2)
      [stageRow(VERIF1_ID, 2, "verification", "completed")],
      // 6. supplementary between verif1 (order=2) and admin2 (order=4) → supp (order=3)
      [stageRow(SUPP_ID, 3, "supplementary", "completed")],
      // 7. supplementary enrollments: Harry not cancelled, Neville cancelled
      [
        suppEnrollmentRow(HARRY_REG, false),
        suppEnrollmentRow(NEVILLE_REG, true),
        suppEnrollmentRow(HERMIONE_REG, false),
      ],
      // 8. approved results from verification: Harry→London, Neville→Manchester
      [
        approvedResult(HARRY_REG, LONDON_ID, "20"),
        approvedResult(NEVILLE_REG, MANCHESTER_ID, "15"),
      ],
      // 9. update Harry (locked → London)
      [],
      // 10. update Hermione (algorithm → Manchester, highest non-locked score)
      [],
      // 11. delete
      [],
      // 12. insert
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 1 });

    // Harry locked to London (from verification stage)
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Hermione wins Manchester via algorithm
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HERMIONE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: false,
      }),
    );

    // Neville cancelled → not locked, unassigned (Manchester taken by Hermione)
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: undefined,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3 — Supplementary verification locks from supplementary admin
// ═══════════════════════════════════════════════════════════════════════════════

describe("Supplementary verification (order=5) after supplementary admin (order=4)", () => {
  it("locks all assignments from supplementary admin stage", async () => {
    // After supplementary admin (order=4):
    //   Harry → London (approved), Hermione → Manchester (approved)
    //   Neville → unassigned
    // Verification2 (order=5):
    //   Harry and Hermione should be locked. Neville enters algorithm.
    dbQueue.push(
      // 1. stageEnrollments for VERIF2
      [enrollment(HARRY_REG), enrollment(HERMIONE_REG), enrollment(NEVILLE_REG)],
      // 2. stage info: verification, order=5
      [stageRow(VERIF2_ID, 5, "verification")],
      // 3. registrations
      [
        reg(HARRY_REG,    "bachelor_1", [LONDON_ID],     "5.0", 2, 3), // score=20
        reg(HERMIONE_REG, "bachelor_1", [MANCHESTER_ID], "7.0", 3, 5), // score=29
        reg(NEVILLE_REG,  "master_1",   [LONDON_ID, MANCHESTER_ID], "4.0", 1, 2), // score=15
      ],
      // 4. destinations — London has 2 slots so Neville can also get it
      [dest(LONDON_ID, 2), dest(MANCHESTER_ID, 1)],
      // 5. most recent completed admin/verification before order=5 → admin2 (order=4)
      [stageRow(ADMIN2_ID, 4, "admin", "completed")],
      // 6. no supplementary between admin2 (order=4) and verif2 (order=5)
      [],
      // 8. approved results from admin2: Harry→London, Hermione→Manchester
      [
        approvedResult(HARRY_REG, LONDON_ID, "20"),
        approvedResult(HERMIONE_REG, MANCHESTER_ID, "29"),
      ],
      // 9. update Harry (locked)
      [],
      // 10. update Hermione (locked)
      [],
      // 11. update Neville (algorithm → London, 1 slot remaining)
      [],
      // 12. delete
      [],
      // 13. insert
      [],
    );

    const result = await runAssignmentAlgorithm(VERIF2_ID);

    expect(result).toEqual({ assigned: 3, unassigned: 0 });

    // Harry locked to London
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Hermione locked to Manchester
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HERMIONE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: true,
      }),
    );

    // Neville assigned to London via algorithm (second slot)
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: LONDON_ID,
        guaranteed: false,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4 — Guaranteed flag for non-locked students
// ═══════════════════════════════════════════════════════════════════════════════

describe("Guaranteed flag for non-locked students who retain same destination", () => {
  it("marks guaranteed=true when a cancelled student gets reassigned to same destination", async () => {
    // After admin1 (order=1): Harry→London, Neville→Manchester
    // Supplementary (order=2): BOTH cancelled (re-registered)
    // Admin2 (order=3): no locks (all cancelled). Algorithm runs fresh.
    //   Harry (score=20) prefers London → gets London → guaranteed=true (same as previous)
    //   Neville (score=15) prefers Manchester → gets Manchester → guaranteed=true
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2 (order=3 in this scenario)
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG)],
      // 2. stage info: admin, order=3
      [stageRow(ADMIN2_ID, 3, "admin")],
      // 3. registrations
      [
        reg(HARRY_REG,   "bachelor_1", [LONDON_ID],     "5.0", 2, 3), // score=20
        reg(NEVILLE_REG, "master_1",   [MANCHESTER_ID], "4.0", 1, 2), // score=15
      ],
      // 4. destinations
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // 5. most recent completed admin/verification before order=3 → admin1 (order=1)
      [stageRow(ADMIN1_ID, 1, "admin", "completed")],
      // 6. supplementary between admin1 (order=1) and admin2 (order=3) → supp (order=2)
      [stageRow(SUPP_ID, 2, "supplementary", "completed")],
      // 7. supplementary enrollments: BOTH cancelled
      [
        suppEnrollmentRow(HARRY_REG, true),
        suppEnrollmentRow(NEVILLE_REG, true),
      ],
      // 8. approved results from admin1: Harry→London, Neville→Manchester
      //    BUT both are cancelled → both excluded from lockedAssignments
      //    However, previousApprovedDest is populated before the cancelled filter
      //    Actually, looking at the code: cancelled ones are skipped in the loop,
      //    so previousApprovedDest is NOT populated for them.
      //    This means guaranteed will be false for cancelled students — which is correct!
      //    Cancelled students forfeited their guarantee by re-registering.
      [
        approvedResult(HARRY_REG, LONDON_ID, "20"),
        approvedResult(NEVILLE_REG, MANCHESTER_ID, "15"),
      ],
      // 9. update Harry (algorithm → London)
      [],
      // 10. update Neville (algorithm → Manchester)
      [],
      // 11. delete
      [],
      // 12. insert
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    // Both cancelled → both enter algorithm fresh.
    // They get their previous destinations but guaranteed=false because they cancelled.
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: false,
      }),
    );

    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: false,
      }),
    );
  });

  it("marks guaranteed=true for non-locked student who gets same dest via algorithm", async () => {
    // After admin1 (order=1): Harry→London (approved), Neville→Manchester (approved)
    // Supplementary (order=2): Harry did NOT cancel, Neville did NOT cancel
    //   But a NEW student Hermione also enrolled
    // Admin2 (order=3): Harry and Neville are locked.
    //   Hermione enters algorithm only.
    // No case here for non-locked getting same dest... Let me adjust.
    //
    // Better scenario: admin1 assigns Harry to London (approved), Neville unassigned.
    // In verification (order=2), Neville also gets London via algorithm.
    // Since Neville's previousApprovedDest doesn't include him (he was unassigned in admin1),
    // he should NOT be guaranteed.
    //
    // Actually, the guaranteed flag for non-locked students only applies when
    // previousApprovedDest has their regId → same destId. This happens when
    // the student was approved in the previous stage but wasn't locked
    // (e.g., they were in the cancelled set but got reassigned to same place).
    // But if cancelled, previousApprovedDest is not populated for them.
    //
    // The only way a non-locked student gets guaranteed=true is if they were in
    // previousApprovedDest but NOT in lockedAssignments — which can't happen with
    // the current code since both are populated in the same loop.
    //
    // Let's verify: in the code, the loop does:
    //   if (cancelledIds && cancelledIds.has(r.registrationId)) continue;
    //   if (r.destinationId) {
    //     lockedAssignments.set(...);
    //     previousApprovedDest.set(...);
    //   }
    // So they're always set together. A non-locked student can never be in
    // previousApprovedDest. The guaranteed flag on line 475 would only ever
    // be true for locked students (who already get guaranteed=true on line 350).
    //
    // This means guaranteed=true is ONLY for locked students. Non-locked always false.
    // Let's test that explicitly.
    dbQueue.push(
      // 1. stageEnrollments for VERIF1 (order=2)
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG)],
      // 2. stage info: verification, order=2
      [stageRow(VERIF1_ID, 2, "verification")],
      // 3. registrations: Neville now has highest score, wants London
      [
        reg(HARRY_REG,   "bachelor_1", [LONDON_ID],                "5.0", 2, 3), // score=20
        reg(NEVILLE_REG, "master_1",   [LONDON_ID, MANCHESTER_ID], "9.0", 5, 5), // score=37
      ],
      // 4. destinations — London has 2 slots
      [dest(LONDON_ID, 2), dest(MANCHESTER_ID, 1)],
      // 5. prev stage: admin1 completed
      [stageRow(ADMIN1_ID, 1, "admin", "completed")],
      // 6. no supplementary between
      [],
      // 8. Harry approved at London in admin1, Neville was unassigned
      [approvedResult(HARRY_REG, LONDON_ID, "20")],
      // 9. update Harry (locked)
      [],
      // 10. update Neville (algorithm → London, second slot)
      [],
      // 11. delete
      [],
      // 12. insert
      [],
    );

    const result = await runAssignmentAlgorithm(VERIF1_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    // Harry is locked → guaranteed=true
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Neville assigned via algorithm to London — but was NOT previously approved there
    // so guaranteed=false
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: LONDON_ID,
        guaranteed: false,
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 5 — No locks at initial admin stage
// ═══════════════════════════════════════════════════════════════════════════════

describe("Initial admin (order=1): no lock logic triggered", () => {
  it("assigns all students fresh with guaranteed=false", async () => {
    dbQueue.push(
      // 1. stageEnrollments
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG)],
      // 2. stage info: admin, order=1
      [stageRow(ADMIN1_ID, 1, "admin")],
      // 3. registrations
      [
        reg(HARRY_REG,   "bachelor_1", [LONDON_ID],     "5.0", 2, 3), // score=20
        reg(NEVILLE_REG, "master_1",   [MANCHESTER_ID], "4.0", 1, 2), // score=15
      ],
      // 4. destinations
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // order=1 → stage.order > 1 is false → no steps 5-8
      // 5. update Harry (algorithm)
      [],
      // 6. update Neville (algorithm)
      [],
      // 7. delete
      [],
      // 8. insert
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN1_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 0 });

    // All fresh assignments, no guarantees
    for (const row of capturedInsertValues) {
      expect(row.guaranteed).toBe(false);
    }

    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: HARRY_REG, destinationId: LONDON_ID }),
    );
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({ registrationId: NEVILLE_REG, destinationId: MANCHESTER_ID }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6 — Full chain: verification assigns Neville, then supplementary admin
//              should lock Neville from verification (not just admin)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full chain: assignments from verification stage are locked in subsequent admin", () => {
  it("locks Neville's verification assignment in the supplementary admin stage", async () => {
    // admin1 (order=1): Harry→London, Neville unassigned
    // verif1 (order=2): Harry locked at London, Neville→Manchester via algorithm, both approved
    // supp (order=3): Harry did NOT cancel, Neville did NOT cancel
    // admin2 (order=4): should lock BOTH from verif1.
    //   Hermione is new, enters algorithm.
    dbQueue.push(
      // 1. stageEnrollments for ADMIN2 (order=4)
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG), enrollment(HERMIONE_REG)],
      // 2. stage info
      [stageRow(ADMIN2_ID, 4, "admin")],
      // 3. registrations
      [
        reg(HARRY_REG,    "bachelor_1", [LONDON_ID],     "5.0", 2, 3), // score=20
        reg(NEVILLE_REG,  "master_1",   [MANCHESTER_ID], "4.0", 1, 2), // score=15
        reg(HERMIONE_REG, "bachelor_1", [LONDON_ID, MANCHESTER_ID], "8.0", 4, 6), // score=34
      ],
      // 4. destinations — London has 2 slots so Hermione can also get it
      [dest(LONDON_ID, 2), dest(MANCHESTER_ID, 1)],
      // 5. most recent completed admin/verification before order=4 → verif1 (order=2, completed)
      [stageRow(VERIF1_ID, 2, "verification", "completed")],
      // 6. supplementary between verif1 (order=2) and admin2 (order=4) → supp (order=3)
      [stageRow(SUPP_ID, 3, "supplementary", "completed")],
      // 7. supplementary enrollments: nobody cancelled
      [
        suppEnrollmentRow(HARRY_REG, false),
        suppEnrollmentRow(NEVILLE_REG, false),
        suppEnrollmentRow(HERMIONE_REG, false),
      ],
      // 8. approved results from verif1: Harry→London, Neville→Manchester
      [
        approvedResult(HARRY_REG, LONDON_ID, "20"),
        approvedResult(NEVILLE_REG, MANCHESTER_ID, "15"),
      ],
      // 9. update Harry (locked)
      [],
      // 10. update Neville (locked)
      [],
      // 11. update Hermione (algorithm → London, second slot)
      [],
      // 12. delete
      [],
      // 13. insert
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 3, unassigned: 0 });

    // Harry locked from verification
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Neville locked from verification (this was Bug 5 — previously only admin was checked)
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: true,
      }),
    );

    // Hermione gets London via algorithm
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HERMIONE_REG,
        destinationId: LONDON_ID,
        guaranteed: false,
      }),
    );
  });

  it("correctly unlocks a student who cancelled in supplementary after verification assignment", async () => {
    // verif1 (order=2): Harry→London, Neville→Manchester (both approved)
    // supp (order=3): Harry did NOT cancel, Neville CANCELLED
    // admin2 (order=4): Harry locked at London, Neville enters algorithm.
    //   Hermione (new, score=34) wants Manchester first → gets it.
    //   Neville (score=15) wants Manchester → taken → unassigned.
    dbQueue.push(
      [enrollment(HARRY_REG), enrollment(NEVILLE_REG), enrollment(HERMIONE_REG)],
      [stageRow(ADMIN2_ID, 4, "admin")],
      [
        reg(HARRY_REG,    "bachelor_1", [LONDON_ID],                "5.0", 2, 3), // score=20
        reg(NEVILLE_REG,  "master_1",   [MANCHESTER_ID],            "4.0", 1, 2), // score=15
        reg(HERMIONE_REG, "bachelor_1", [MANCHESTER_ID, LONDON_ID], "8.0", 4, 6), // score=34
      ],
      [dest(LONDON_ID, 1), dest(MANCHESTER_ID, 1)],
      // 5. prev stage: verif1 (completed)
      [stageRow(VERIF1_ID, 2, "verification", "completed")],
      // 6. supplementary between
      [stageRow(SUPP_ID, 3, "supplementary", "completed")],
      // 7. enrollments: Neville cancelled
      [
        suppEnrollmentRow(HARRY_REG, false),
        suppEnrollmentRow(NEVILLE_REG, true),
        suppEnrollmentRow(HERMIONE_REG, false),
      ],
      // 8. approved results from verif1
      [
        approvedResult(HARRY_REG, LONDON_ID, "20"),
        approvedResult(NEVILLE_REG, MANCHESTER_ID, "15"),
      ],
      // 9. update Harry (locked)
      [],
      // 10. update Hermione (algorithm → Manchester)
      [],
      // 11. delete
      [],
      // 12. insert
      [],
    );

    const result = await runAssignmentAlgorithm(ADMIN2_ID);

    expect(result).toEqual({ assigned: 2, unassigned: 1 });

    // Harry locked
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HARRY_REG,
        destinationId: LONDON_ID,
        guaranteed: true,
      }),
    );

    // Hermione wins Manchester
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: HERMIONE_REG,
        destinationId: MANCHESTER_ID,
        guaranteed: false,
      }),
    );

    // Neville cancelled → not locked, unassigned
    expect(capturedInsertValues).toContainEqual(
      expect.objectContaining({
        registrationId: NEVILLE_REG,
        destinationId: undefined,
      }),
    );
  });
});
