/**
 * Tests that the GET /api/registration/[slotId] endpoint does not expose
 * the admin-only `notes` field to students.
 *
 * The `registrations.notes` column is for admin use only and must never
 * be returned in the student-facing registration API. The GET route currently
 * spreads the full registrations row (`...regResult[0]`) into the response,
 * so this suite acts as a regression guard.
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

const { dbQueue } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
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
  getStudentRegistrationLink: (id: string) => `http://localhost/en/register/${id}`,
}));

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
const REGISTRATION_ID = "reg-00000000-0000-0000-0000-000000000001";
const SECRET_NOTE = "Student struggled in interview — do not assign to Paris";

// ── DB queue helpers ──────────────────────────────────────────────────────────

/**
 * Queues the DB responses for a GET /api/registration/[slotId] request where:
 *  - The slot already has a registered student
 *  - The initial stage is active
 *  - The registration row has a non-null `notes` field
 *
 * The slot status is set to "registration_started" to skip the update/count
 * queries that only fire for "open" or "registered" slots.
 *
 * DB call order (from route.ts):
 *  1. select slot
 *  2. select recruitment
 *  3. select initial stage (type=initial)
 *  4. select supplementary stage (type=supplementary, status=active)
 *  5. select registration (slot has studentId)
 *  6. select student user
 *  7. select all stages (for welcome page)
 *  (no destinations query — destinationPreferences is empty)
 */
function queueGetWithNotes(notes: string | null) {
  dbQueue.push(
    // 1. slot
    [{
      id: SLOT_ID,
      number: 1,
      status: "registration_started",
      studentId: USER_EMMA_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      createdAt: new Date("2025-01-01"),
    }],
    // 2. recruitment
    [{
      id: WINTER_RECRUITMENT_ID,
      name: "Winter Erasmus 2025",
      description: "Winter semester exchange programme",
      maxDestinationChoices: 3,
      eligibleLevels: JSON.stringify(["bachelor_1", "bachelor_2", "bachelor_3", "master_1", "master_2"]),
      startDate: new Date("2025-01-10"),
      endDate: new Date("2025-06-30"),
    }],
    // 3. initial stage
    [{
      id: WINTER_STAGE_INITIAL_ID,
      type: "initial",
      status: "active",
      recruitmentId: WINTER_RECRUITMENT_ID,
      startDate: new Date("2025-01-10"),
      endDate: new Date("2025-02-01"),
      order: 1,
    }],
    // 4. supplementary stage (not active)
    [],
    // 5. registration with notes
    [{
      id: REGISTRATION_ID,
      slotId: SLOT_ID,
      studentId: USER_EMMA_ID,
      emailConsent: true,
      privacyConsent: true,
      level: "bachelor_2",
      spokenLanguages: JSON.stringify(["English"]),
      destinationPreferences: "[]",
      enrollmentId: "123456",
      averageResult: null,
      additionalActivities: null,
      recommendationLetters: null,
      notes,
      registrationCompleted: true,
      notEligible: false,
      registrationCompletedAt: new Date("2025-01-15"),
      createdAt: new Date("2025-01-15"),
      updatedAt: new Date("2025-01-15"),
    }],
    // 6. student user
    [{
      id: USER_EMMA_ID,
      fullName: "Emma Johnson",
      email: "emma.johnson@student.edu",
      locale: "en",
      createdAt: new Date("2025-01-01"),
    }],
    // 7. all stages
    [{
      id: WINTER_STAGE_INITIAL_ID,
      name: "Initial Registration",
      description: "Open registration period",
      startDate: new Date("2025-01-10"),
      endDate: new Date("2025-02-01"),
      type: "initial",
      status: "active",
      order: 1,
    }],
  );
}

// ── import route handler (after mocks are configured) ────────────────────────

import { GET } from "../[slotId]/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/registration/[slotId] — notes field not exposed", () => {
  it("does not include notes in the registration object when notes is set", async () => {
    queueGetWithNotes(SECRET_NOTE);

    const req = new NextRequest(`http://localhost/api/registration/${SLOT_ID}`);
    const res = await GET(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.registration).toBeDefined();
    expect(body.registration).not.toHaveProperty("notes");
  });

  it("does not include the notes content anywhere in the response body", async () => {
    queueGetWithNotes(SECRET_NOTE);

    const req = new NextRequest(`http://localhost/api/registration/${SLOT_ID}`);
    const res = await GET(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    const raw = await res.text();
    expect(raw).not.toContain(SECRET_NOTE);
  });

  it("does not expose notes even when notes is null", async () => {
    queueGetWithNotes(null);

    const req = new NextRequest(`http://localhost/api/registration/${SLOT_ID}`);
    const res = await GET(req, { params: Promise.resolve({ slotId: SLOT_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.registration).toBeDefined();
    expect(body.registration).not.toHaveProperty("notes");
  });
});
