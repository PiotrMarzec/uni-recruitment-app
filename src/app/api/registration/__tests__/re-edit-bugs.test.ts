/**
 * Route-level unit tests that reproduce bugs in the re-edit registration scenario.
 *
 * Manually reproduced at:
 *   Dashboard : http://192.168.0.239:3000/pl/admin/recruitment/10000000-0000-0000-0000-000000000002/stage/20000002-0000-0000-0000-000000000001
 *   Registration: http://localhost:3000/en/register/50000002-0000-0000-0000-000000000007
 *
 * ── Bug 1 – GET /api/registration/[slotId] ────────────────────────────────────
 * The guard on line 63 of route.ts reads:
 *   if (isInitialActive && slot.status === "open")
 * When a student re-opens a COMPLETED registration the slot is already "registered",
 * so the condition is false → slot_status_update is never broadcast → the admin
 * dashboard in-progress counter stays at 0 while the student is actively editing.
 *
 * ── Bug 2 – POST /api/registration/[slotId]/step (steps 3-6) ─────────────────
 * Line 316 of step/route.ts broadcasts:
 *   registrationCompleted: existingReg.registrationCompleted
 * For a re-edit of a previously completed registration this value is `true`.
 * The admin dashboard therefore shows the slot as "complete" the moment the student
 * reaches step 4 — before they have re-submitted the form.
 *
 * ── Bug 3 – POST /api/registration/[slotId]/complete ─────────────────────────
 * complete/route.ts only fires broadcastRegistrationUpdate (counter update) but
 * never fires broadcastRegistrationStepUpdate with registrationCompleted: true.
 * The dashboard's recentRegistrations list is only updated by registration_step_update
 * events, so the status dot for the slot stays yellow (in-progress) after the student
 * submits the completed form — it never turns green.
 *
 * ── Bug 4 – POST /api/registration/[slotId]/step (step 2, re-edit) ────────────
 * step/route.ts step 2 broadcast hardcodes completedAt: null.
 * For a re-edit the registration already has registrationCompletedAt set, but the
 * broadcast discards it → the dashboard's "Completed:" date disappears for the
 * entire editing session (steps 2 through final submit).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_STAGE_INITIAL_ID,
  WINTER_SLOT_IDS,
  USER_EMMA_ID,
  WINTER_RECRUITMENT_ID,
  WINTER_REG_IDS,
} from "../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────
// vi.hoisted ensures these values exist before the vi.mock factories below run.

const { dbQueue, mockBroadcastSlotStatusUpdate, mockBroadcastRegistrationStepUpdate } =
  vi.hoisted(() => ({
    dbQueue: [] as any[][],
    mockBroadcastSlotStatusUpdate: vi.fn(),
    mockBroadcastRegistrationStepUpdate: vi.fn(),
  }));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/websocket/events", () => ({
  broadcastSlotStatusUpdate: mockBroadcastSlotStatusUpdate,
  broadcastRegistrationStepUpdate: mockBroadcastRegistrationStepUpdate,
  broadcastRegistrationUpdate: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(),
  ACTIONS: { REGISTRATION_STEP_COMPLETED: "step_completed", REGISTRATION_COMPLETED: "completed" },
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
 * Chainable Drizzle-ORM mock.
 *
 * Each call to db.select() / db.update() / db.insert() consumes the next entry
 * from dbQueue and returns a thenable chain where every builder method returns
 * `this`, so the full query chain resolves to that entry's data.
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

const SLOT_ID = WINTER_SLOT_IDS[0]; // Emma Johnson — slot is "registered" in seed
const STAGE_ID = WINTER_STAGE_INITIAL_ID;
const RECRUITMENT_ID = WINTER_RECRUITMENT_ID;
const REG_ID = WINTER_REG_IDS[0];

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

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * Queue responses for GET /api/registration/[slotId] when the slot is already
 * "registered" (i.e. the student previously completed registration and is now
 * re-opening the link to edit).
 *
 * DB call order in route.ts (after Bug 1 fix):
 *   1. select slot
 *   2. select recruitment
 *   3. select initial stage
 *   4. select supplementary stage  (returns [] — only initial is active here)
 *   5. update slot  registered → registration_started
 *   6. select counts by status  (for slot_status_update broadcast)
 *   7. select registration      (slot.studentId is still set → fetched via studentId check)
 *   8. select user
 */
function queueGetRegisteredSlot() {
  dbQueue.push(
    [{ id: SLOT_ID, number: 1, status: "registered", studentId: USER_EMMA_ID, recruitmentId: RECRUITMENT_ID, createdAt: new Date("2026-03-01") }],
    [{ id: RECRUITMENT_ID, name: "Winter Erasmus 2026", description: "", maxDestinationChoices: 5 }],
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID, endDate: new Date("2026-03-11") }],
    [],  // supplementary stage → not active
    [],  // update: slot registered → registration_started
    [{ status: "registration_started", n: 1 }, { status: "open", n: 5 }],  // counts
    [{ id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID, registrationCompleted: true, spokenLanguages: "[]", destinationPreferences: "[]", registrationCompletedAt: new Date("2026-03-01"), updatedAt: new Date() }],
    [{ id: USER_EMMA_ID, email: "emma.johnson@student.edu", fullName: "Emma Johnson" }],
  );
}

/**
 * Queue responses for POST /api/registration/[slotId]/step with {step: 4}
 * when re-editing a previously completed registration.
 *
 * DB call order in step/route.ts:
 *   1. select slot
 *   2. select initial stage   (getActiveInitialStage)
 *   3. select existingReg     (registrationCompleted: true — the re-edit case)
 *   4. update registration    (set level)
 *   5. select updatedUser
 */
function queueStep4ReEdit() {
  dbQueue.push(
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registered", studentId: USER_EMMA_ID }],
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID }],
    [{ id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID, registrationCompleted: true, registrationCompletedAt: new Date("2026-03-01"), level: "bachelor" }],
    [], // update result
    [{ fullName: "Emma Johnson", email: "emma.johnson@student.edu" }],
  );
}

// ── import route handlers (after mocks are configured) ───────────────────────

import { GET } from "../[slotId]/route";
import { POST as stepPOST } from "../[slotId]/step/route";
import { POST as completePOST } from "../[slotId]/complete/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ── Bug 1 ─────────────────────────────────────────────────────────────────────

describe("Bug 1 – GET route does not fire slot_status_update for registered slot (re-edit)", () => {
  it("should broadcast slot_status_update so the in-progress counter increments", async () => {
    queueGetRegisteredSlot();

    const req = makeGetRequest(SLOT_ID);
    await GET(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // route.ts line 63:  if (isInitialActive && slot.status === "open")
    // For a re-edit the slot is "registered" → condition is false →
    // broadcastSlotStatusUpdate is never called → dashboard counter stays at 0.
    expect(mockBroadcastSlotStatusUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastSlotStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "slot_status_update",
        stageId: STAGE_ID,
        startedSlotsCount: expect.any(Number),
      }),
    );
  });
});

// ── Bug 2 ─────────────────────────────────────────────────────────────────────

describe("Bug 2 – Step route broadcasts registrationCompleted: true during re-edit (step 4)", () => {
  it("should broadcast registrationCompleted: false while the student is still editing", async () => {
    queueStep4ReEdit();

    const req = makeStepRequest(SLOT_ID, { step: 4, level: "master_1" });
    await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // step/route.ts line 316:  registrationCompleted: existingReg.registrationCompleted
    // For a re-edit existingReg.registrationCompleted is true → the dashboard
    // receives registrationCompleted: true at step 4 and marks the slot "complete"
    // before the student has re-submitted the form.
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration: expect.objectContaining({
          registrationCompleted: false,
        }),
      }),
    );
  });
});

// ── Bug 3 ─────────────────────────────────────────────────────────────────────

/**
 * Queue responses for POST /api/registration/[slotId]/complete when re-editing
 * a previously completed registration (slot is currently "registration_started"
 * because GET already moved it from "registered").
 *
 * DB call order in complete/route.ts:
 *   1. select slot
 *   2. select initial stage
 *   3. select supplementary stage  (returns [] — only initial is active here)
 *   4. select registration
 *   5. update registration   (set registrationCompleted: true)
 *   6. select user            (Promise.all[0], for email)
 *   7. select recruitment     (Promise.all[1], for email subject)
 *   8. select destinations    (Promise.all[2], for email body)
 *   9. update slot            (registration_started → registered)
 *  10. select open count
 *  11. select started count
 *  12. select registered count
 */
function queueCompleteReEdit() {
  dbQueue.push(
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registration_started", studentId: USER_EMMA_ID }],
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID }],
    [],  // supplementary stage → not active
    [{ id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID, registrationCompleted: true, registrationCompletedAt: new Date("2026-03-01"), level: "master", destinationPreferences: "[\"dest-uuid\"]", spokenLanguages: "[\"en\"]", enrollmentId: "123456" }],
    [],  // update registration
    [{ id: USER_EMMA_ID, email: "emma.johnson@student.edu", fullName: "Emma Johnson" }],  // Promise.all[0]
    [{ name: "Winter Erasmus 2026" }],  // Promise.all[1] recruitment name
    [],  // Promise.all[2] destinations (empty — names not needed for this assertion)
    [],  // update slot
    [{ count: 5 }],  // open count
    [{ count: 0 }],  // started count
    [{ count: 5 }],  // registered count
  );
}

describe("Bug 3 – complete route does not fire registration_step_update with registrationCompleted: true", () => {
  it("should broadcast registration_step_update with registrationCompleted: true so the status dot turns green", async () => {
    queueCompleteReEdit();

    const req = new NextRequest(`http://localhost/api/registration/${SLOT_ID}/complete`, {
      method: "POST",
    });
    await completePOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // complete/route.ts only calls broadcastRegistrationUpdate (counter update).
    // It never calls broadcastRegistrationStepUpdate, so the recentRegistrations row
    // in the dashboard retains registrationCompleted: false and the status dot stays
    // yellow even after the student has successfully submitted the form.
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration: expect.objectContaining({
          slotId: SLOT_ID,
          registrationCompleted: true,
        }),
      }),
    );
  });
});

// ── Bug 4 ─────────────────────────────────────────────────────────────────────

/**
 * Queue responses for POST /api/registration/[slotId]/step with {step: 2}
 * when re-editing a previously completed registration.
 *
 * DB call order in step/route.ts for step 2:
 *   1. select slot
 *   2. select initial stage   (getActiveInitialStage)
 *   3. select user by email   (existing user found — no insert)
 *   4. update user locale     (update locale for returning users)
 *   5. select existingReg     (registrationCompleted: true, registrationCompletedAt set)
 *   6. select enrollment ID fallback (existingReg.enrollmentId is null → fallback query)
 */
function queueStep2ReEdit() {
  dbQueue.push(
    [{ id: SLOT_ID, number: 1, recruitmentId: RECRUITMENT_ID, status: "registration_started", studentId: USER_EMMA_ID }],
    [{ id: STAGE_ID, type: "initial", status: "active", recruitmentId: RECRUITMENT_ID }],
    [{ id: USER_EMMA_ID, email: "emma.johnson@student.edu", fullName: "Emma Johnson" }],
    [], // update user locale
    [{ id: REG_ID, slotId: SLOT_ID, studentId: USER_EMMA_ID, registrationCompleted: true, registrationCompletedAt: new Date("2026-03-01T10:00:00.000Z"), enrollmentId: null }],
    [], // enrollment ID fallback — no prior registrations
  );
}

describe("Bug 4 – step 2 broadcast discards completedAt for re-edit (completed date disappears)", () => {
  it("should preserve the original completedAt so the completed date stays visible during editing", async () => {
    queueStep2ReEdit();

    const req = makeStepRequest(SLOT_ID, {
      step: 2,
      code: "123456",
      email: "emma.johnson@student.edu",
    });
    await stepPOST(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    // ✗ CURRENTLY FAILS:
    // step/route.ts step 2 broadcast hardcodes completedAt: null.
    // For a re-edit existingReg.registrationCompletedAt is "2026-03-01T10:00:00.000Z",
    // but it is thrown away → the dashboard's "Completed:" date disappears the moment
    // the student re-authenticates and stays missing for the entire editing session.
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastRegistrationStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        registration: expect.objectContaining({
          completedAt: "2026-03-01T10:00:00.000Z",
        }),
      }),
    );
  });
});
