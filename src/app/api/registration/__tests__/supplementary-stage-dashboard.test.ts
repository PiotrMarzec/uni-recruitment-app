/**
 * Tests that reproduce the live dashboard not updating during a supplementary stage.
 *
 * Manually reproduced at:
 *   Dashboard : http://192.168.0.239:3000/pl/admin/recruitment/10000000-0000-0000-0000-000000000002/stage/20000002-0000-0000-0000-000000000003
 *
 * Root cause: all WebSocket broadcasts use `initialStage.id` as the stageId, but
 * the supplementary stage live dashboard subscribes using `supplementaryStage.id`.
 * When only the supplementary stage is active, `initialStage` is null and the
 * `if (initialStage)` guards prevent every broadcast → the dashboard receives nothing.
 *
 * ── Bug A – GET /api/registration/[slotId] ────────────────────────────────────
 * When a student opens their registration link during the supplementary stage the
 * route changes the slot from "registered" → "registration_started" but the
 * broadcastSlotStatusUpdate call is inside `if (initialStage)` which is null →
 * the supplementary dashboard in-progress counter never updates.
 *
 * ── Bug B – POST /api/registration/[slotId]/step ─────────────────────────────
 * Same guard (`if (initialStage)`) around broadcastRegistrationStepUpdate →
 * the supplementary dashboard recentRegistrations list never updates while the
 * student is actively editing.
 *
 * ── Bug C – POST /api/registration/[slotId]/complete ─────────────────────────
 * The entire broadcast block is wrapped in `if (initialStage)` → the supplementary
 * dashboard receives neither registration_step_update (status dot stays yellow) nor
 * registration_update (counters stay stale) after the student completes their edit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_STAGE_ADMIN1_ID,
  WINTER_STAGE_SUPP_ID,
  WINTER_SLOT_IDS,
  USER_EMMA_ID,
  WINTER_RECRUITMENT_ID,
  WINTER_REG_IDS,
} from "../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────

const {
  dbQueue,
  updateSetArgs,
  mockBroadcastSlotStatusUpdate,
  mockBroadcastRegistrationStepUpdate,
  mockBroadcastRegistrationUpdate,
} = vi.hoisted(() => ({
  dbQueue: [] as any[][],
  /** Captures every argument object passed to db.update(...).set(args) */
  updateSetArgs: [] as any[],
  mockBroadcastSlotStatusUpdate: vi.fn(),
  mockBroadcastRegistrationStepUpdate: vi.fn(),
  mockBroadcastRegistrationUpdate: vi.fn(),
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/websocket/events", () => ({
  broadcastSlotStatusUpdate: mockBroadcastSlotStatusUpdate,
  broadcastRegistrationStepUpdate: mockBroadcastRegistrationStepUpdate,
  broadcastRegistrationUpdate: mockBroadcastRegistrationUpdate,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: {
    REGISTRATION_STEP_COMPLETED: "step_completed",
    REGISTRATION_COMPLETED: "completed",
  },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/auth/hmac", () => ({
  getTeacherPath: (id: string) => `/en/manage/${id}/sig`,
  getStudentRegistrationLink: (id: string) => `http://localhost:3000/en/register/${id}`,
}));

vi.mock("@/lib/auth/otp", () => ({
  issueOtp: vi.fn(),
  verifyOtp: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/email/send", () => ({
  sendOtpEmail: vi.fn(),
  sendRegistrationCompletedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getRegistrationSessionFromRequest: vi.fn().mockResolvedValue({
    userId: USER_EMMA_ID,
    email: "emma.johnson@student.edu",
    name: "Emma Johnson",
    save: vi.fn(),
  }),
  getSessionFromRequest: vi.fn().mockResolvedValue({
    userId: USER_EMMA_ID,
    email: "emma.johnson@student.edu",
    name: "Emma Johnson",
    save: vi.fn(),
  }),
}));

/**
 * Chainable Drizzle-ORM mock that consumes from dbQueue on each db.select/update/insert.
 */
vi.mock("@/db", () => {
  function makeChain(): any {
    const data = dbQueue.shift() ?? [];
    const obj: any = {
      from: () => obj,
      where: () => obj,
      limit: () => obj,
      groupBy: () => obj,
      orderBy: () => obj,
      set: (args: any) => { updateSetArgs.push(args); return obj; },
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

// ── seed-data shortcuts ───────────────────────────────────────────────────────

const SLOT_ID = WINTER_SLOT_IDS[0];       // Emma Johnson's slot — "registered" in seed
const SUPP_STAGE_ID = WINTER_STAGE_SUPP_ID;
const ADMIN1_STAGE_ID = WINTER_STAGE_ADMIN1_ID;
const RECRUITMENT_ID = WINTER_RECRUITMENT_ID;
const REG_ID = WINTER_REG_IDS[0];
const ASSIGNED_DEST_ID = "70000002-0000-0000-0000-000000000001"; // Emma's assigned dest

// ── request factories ─────────────────────────────────────────────────────────

function makeGetRequest(slotId: string): NextRequest {
  return new NextRequest(`http://localhost/api/registration/${slotId}`);
}

function makeStepRequest(slotId: string, body: object): NextRequest {
  return new NextRequest(`http://localhost/api/registration/${slotId}/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCompleteRequest(slotId: string): NextRequest {
  return new NextRequest(`http://localhost/api/registration/${slotId}/complete`, {
    method: "POST",
  });
}

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * GET /api/registration/[slotId] when ONLY the supplementary stage is active.
 * Emma's slot is "registered" (she completed registration during the initial stage).
 *
 * DB call order (route.ts):
 *  1. select slot
 *  2. select recruitment
 *  3. select initial stage         → [] (not active)
 *  4. select supplementary stage   → [active]
 *  5. update slot: registered → registration_started
 *  6. select counts by status
 *  7. select registration
 *  8. select user
 *  9. select completed admin stage (for assignment lookup)
 * 10. select stageEnrollment       → has assignedDestinationId
 * 11. select destination name
 */
function queueGetSupplementaryRegisteredSlot() {
  dbQueue.push(
    // 1. slot
    [{ id: SLOT_ID, number: 1, status: "registered", studentId: USER_EMMA_ID, recruitmentId: RECRUITMENT_ID, createdAt: new Date("2026-03-01") }],
    // 2. recruitment
    [{ id: RECRUITMENT_ID, name: "Winter Erasmus 2026", description: "", maxDestinationChoices: 5 }],
    // 3. initial stage → not active
    [],
    // 4. supplementary stage → active
    [{ id: SUPP_STAGE_ID, type: "supplementary", status: "active", recruitmentId: RECRUITMENT_ID, endDate: new Date("2026-03-25") }],
    // 5. update slot → void
    [],
    // 6. counts
    [{ status: "registration_started", n: 1 }, { status: "open", n: 5 }],
    // 7. registration
    [{
      id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID,
      registrationCompleted: true, spokenLanguages: "[]",
      destinationPreferences: "[]",
      registrationCompletedAt: new Date("2026-03-10"),
      updatedAt: new Date(),
    }],
    // 8. user
    [{ id: USER_EMMA_ID, email: "emma.johnson@student.edu", fullName: "Emma Johnson" }],
    // 9. completed admin stage
    [{ id: ADMIN1_STAGE_ID, type: "admin", status: "completed", order: 2, recruitmentId: RECRUITMENT_ID }],
    // 10. stageEnrollment → has assignment
    [{ assignedDestinationId: ASSIGNED_DEST_ID }],
    // 11. destination name
    [{ name: "University of Vienna" }],
  );
}

/**
 * POST /api/registration/[slotId]/step with {step: 4} when ONLY supplementary is active.
 *
 * DB call order (step/route.ts):
 *  1. select slot
 *  2. select initial stage         → [] (not found → check supplementary)
 *  3. select supplementary stage   → [active]
 *  4. select existingReg
 *  5. update registration
 *  6. select updatedUser
 */
function queueStep4Supplementary() {
  dbQueue.push(
    // 1. slot
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registration_started", studentId: USER_EMMA_ID }],
    // 2. initial stage → not found
    [],
    // 3. supplementary stage → active
    [{ id: SUPP_STAGE_ID, type: "supplementary", status: "active", recruitmentId: RECRUITMENT_ID }],
    // 4. existingReg (registrationCompleted: true from initial stage)
    [{
      id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID,
      registrationCompleted: true,
      registrationCompletedAt: new Date("2026-03-10T10:00:00.000Z"),
      level: "bachelor",
    }],
    // 5. update registration → void
    [],
    // 6. updatedUser
    [{ fullName: "Emma Johnson", email: "emma.johnson@student.edu" }],
  );
}

/**
 * POST /api/registration/[slotId]/complete when ONLY supplementary is active.
 * Emma's slot is "registration_started" (GET already moved it from "registered").
 *
 * DB call order (complete/route.ts):
 *  1.  select slot
 *  2.  select initial stage                   → [] (not active)
 *  3.  select supplementary stage             → [active]
 *  4.  select registration
 *  5.  update registration (set completed: true)
 *  6.  update stageEnrollments (set cancelled: true) ← marks re-registration
 *  7.  select completed admin stage           (for clearing previous assignment)
 *  8.  update stageEnrollments (set assignedDestinationId: null)
 *  9.  select user                            (Promise.all[0])
 * 10.  select recruitment name               (Promise.all[1])
 * 11.  select destinations                   (Promise.all[2])
 * 12.  update slot (registration_started → registered)
 * 13.  select open count
 * 14.  select started count
 * 15.  select registered count
 */
function queueCompleteSupplementary() {
  dbQueue.push(
    // 1. slot
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registration_started", studentId: USER_EMMA_ID }],
    // 2. initial stage → not active
    [],
    // 3. supplementary stage → active
    [{ id: SUPP_STAGE_ID, type: "supplementary", status: "active", recruitmentId: RECRUITMENT_ID }],
    // 4. registration
    [{
      id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID,
      registrationCompleted: true,
      registrationCompletedAt: new Date("2026-03-10"),
      level: "master",
      destinationPreferences: JSON.stringify([ASSIGNED_DEST_ID]),
      spokenLanguages: JSON.stringify(["English"]),
      enrollmentId: "123456",
    }],
    // 5. update registration → void
    [],
    // 6. update stageEnrollments (set cancelled: true) → void
    [],
    // 7. completed admin stage (for clearing previous assignment)
    [{ id: ADMIN1_STAGE_ID, type: "admin", status: "completed", order: 2, recruitmentId: RECRUITMENT_ID }],
    // 8. update stageEnrollments (clear assignedDestinationId) → void
    [],
    // 9. user (Promise.all[0])
    [{ id: USER_EMMA_ID, email: "emma.johnson@student.edu", fullName: "Emma Johnson" }],
    // 10. recruitment name (Promise.all[1])
    [{ name: "Winter Erasmus 2026" }],
    // 11. destinations → empty (Promise.all[2])
    [],
    // 12. update slot → void
    [],
    // 13. open count
    [{ count: 5 }],
    // 14. started count
    [{ count: 0 }],
    // 15. registered count
    [{ count: 5 }],
  );
}

// ── import route handlers (after mocks are configured) ───────────────────────

import { GET } from "../[slotId]/route";
import { POST as stepPOST } from "../[slotId]/step/route";
import { POST as completePOST } from "../[slotId]/complete/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  updateSetArgs.length = 0;
  vi.clearAllMocks();
});

// ── Bug A ─────────────────────────────────────────────────────────────────────

describe("Bug A – GET route does not broadcast slot_status_update to supplementary stage dashboard", () => {
  it("should broadcast slot_status_update using the supplementary stageId so the in-progress counter updates", async () => {
    queueGetSupplementaryRegisteredSlot();

    const req = makeGetRequest(SLOT_ID);
    await GET(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // The broadcast is inside `if (initialStage)` which is null during supplementary →
    // broadcastSlotStatusUpdate is never called → the dashboard counter stays stale.
    expect(mockBroadcastSlotStatusUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastSlotStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "slot_status_update",
        stageId: SUPP_STAGE_ID,
        startedSlotsCount: expect.any(Number),
      }),
    );
  });
});

// ── Bug B ─────────────────────────────────────────────────────────────────────

describe("Bug B – step route does not broadcast registration_step_update to supplementary stage dashboard", () => {
  it("should broadcast registration_step_update using the supplementary stageId so the recentRegistrations list updates", async () => {
    queueStep4Supplementary();

    const req = makeStepRequest(SLOT_ID, { step: 4, level: "master_1" });
    await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // The broadcast is inside `if (initialStage)` which is null during supplementary →
    // broadcastRegistrationStepUpdate is never called → the dashboard recentRegistrations
    // list never reflects the student's editing activity.
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "registration_step_update",
        stageId: SUPP_STAGE_ID,
        registration: expect.objectContaining({
          slotId: SLOT_ID,
          registrationCompleted: false,
        }),
      }),
    );
  });
});

// ── Bug C ─────────────────────────────────────────────────────────────────────

describe("Bug C – complete route does not broadcast to supplementary stage dashboard", () => {
  it("should broadcast registration_step_update with registrationCompleted: true so the status dot turns green", async () => {
    queueCompleteSupplementary();

    const req = makeCompleteRequest(SLOT_ID);
    await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // The entire broadcast block is inside `if (initialStage)` which is null →
    // neither registration_step_update nor registration_update is sent to the
    // supplementary dashboard.
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "registration_step_update",
        stageId: SUPP_STAGE_ID,
        registration: expect.objectContaining({
          slotId: SLOT_ID,
          registrationCompleted: true,
        }),
      }),
    );
  });

  it("should broadcast registration_update with supplementary stageId so the counters update", async () => {
    queueCompleteSupplementary();

    const req = makeCompleteRequest(SLOT_ID);
    await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS: same root cause — inside `if (initialStage)` guard.
    expect(mockBroadcastRegistrationUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "registration_update",
        stageId: SUPP_STAGE_ID,
      }),
    );
  });
});

// ── Re-registration cancellation ──────────────────────────────────────────────

describe("complete route — re-registration during supplementary stage marks enrollment as cancelled", () => {
  /**
   * When a student re-registers during the supplementary stage they forfeit their
   * guaranteed placement.  The fix sets cancelled: true on their stageEnrollments
   * row for the supplementary stage so the assignment algorithm and the admin
   * applications grid both treat them as a re-entrant (not locked).
   */
  it("sets cancelled: true on the supplementary stageEnrollments row", async () => {
    queueCompleteSupplementary();

    const req = makeCompleteRequest(SLOT_ID);
    await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(updateSetArgs).toContainEqual(
      expect.objectContaining({ cancelled: true }),
    );
  });

  it("still clears the previous admin-stage assignedDestinationId after marking cancelled", async () => {
    queueCompleteSupplementary();

    const req = makeCompleteRequest(SLOT_ID);
    await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(updateSetArgs).toContainEqual(
      expect.objectContaining({ assignedDestinationId: null }),
    );
  });

  it("consumes all DB calls in the expected order (queue is empty after completion)", async () => {
    queueCompleteSupplementary();

    const req = makeCompleteRequest(SLOT_ID);
    const res = await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(200);
    expect(dbQueue.length).toBe(0);
  });
});
