/**
 * Covers the scenario where students in a supplementary admin stage should see
 * their guaranteed destinations from the previous admin stage in the edit grid,
 * even before the assignment algorithm has been run.
 *
 * Two bugs were fixed and are tested here:
 *
 * Bug 1 — end/route.ts:
 *   When an admin stage ends and the next stage is supplementary, stageEnrollments
 *   were NOT being created for the supplementary stage.  Without these rows the
 *   assignment algorithm treated every student as "cancelled" (non-guaranteed) and
 *   the Approved column showed "—" for all students.
 *   Fix: insert one stageEnrollments row per completed registration before sending
 *   the supplementary stage invitation emails.
 *
 * Bug 2 — applications/route.ts:
 *   The applications API only fetched assignmentResults for the current admin stage.
 *   Before the algorithm runs, that query returns an empty set, so the Approved
 *   column was always blank.
 *   Fix: when existingAssignments is empty and the stage is a second (or later)
 *   admin stage, look up the previous supplementary stage's enrollments to identify
 *   guaranteed students, then pre-populate assignmentMap from the previous admin
 *   stage's approved results.
 *
 * Scenario (Winter recruitment — orders 1 → 2 → 3 → 4):
 *   order 1  Initial stage       (completed)
 *   order 2  Admin stage 1       (completed)  — 3 students assigned to destinations
 *   order 3  Supplementary stage (completed)  — 2 students cancelled, 1 kept place
 *   order 4  Admin stage 2       (active)     — algorithm not run yet
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  WINTER_RECRUITMENT_ID,
  WINTER_STAGE_ADMIN1_ID,
  WINTER_STAGE_SUPP_ID,
  WINTER_STAGE_ADMIN2_ID,
  WINTER_REG_IDS,
  WINTER_DEST_LONDON_ID,
  WINTER_DEST_BERLIN_ID,
  WINTER_DEST_BARCELONA_ID,
  WINTER_SLOT_IDS,
} from "../../../../../../../scripts/seed-data";

// ── hoisted mock state ────────────────────────────────────────────────────────

const { dbQueue, mockSendSupplementaryStageEmail } = vi.hoisted(() => ({
  dbQueue: [] as any[][],
  mockSendSupplementaryStageEmail: vi.fn(),
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
  ACTIONS: {
    STAGE_TRANSITIONED: "stage.transitioned",
    REGISTRATION_ADMIN_EDITED: "registration.admin_edited",
  },
  getIpAddress: () => "127.0.0.1",
}));

vi.mock("@/lib/email/send", () => ({
  sendSupplementaryStageEmail: mockSendSupplementaryStageEmail,
  sendInitialStageClosedEmail: vi.fn(),
  sendSupplementaryStageClosedEmail: vi.fn(),
}));

vi.mock("@/lib/auth/hmac", () => ({
  getStudentRegistrationLink: vi.fn().mockReturnValue("https://example.com/register/test"),
}));

vi.mock("@/lib/stage-name", () => ({
  getStageName: vi.fn().mockReturnValue("Supplementary recruitment stage #1"),
}));

vi.mock("@/lib/websocket/events", () => ({
  broadcastApplicationRowUpdate: vi.fn(),
  broadcastRegistrationUpdate: vi.fn(),
  broadcastRegistrationStepUpdate: vi.fn(),
}));

/**
 * Chainable Drizzle-ORM mock — same pattern as the other tests in this directory.
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

const SUPP_END_DATE = new Date("2026-03-25T08:00:00.000Z");

// Three Winter students used in this scenario
const REG_EMMA = WINTER_REG_IDS[0];    // Emma Johnson  — keeps Berlin
const REG_CARLOS = WINTER_REG_IDS[1]; // Carlos Garcia — cancelled during supp
const REG_HANS = WINTER_REG_IDS[2];   // Hans Weber    — cancelled during supp

// ── import route handlers (after mocks are set up) ────────────────────────────

import { POST as endPOST } from "../end/route";
import { GET as applicationsGET } from "../applications/route";

// ── reset between tests ───────────────────────────────────────────────────────

beforeEach(() => {
  dbQueue.length = 0;
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — end/route.ts: stageEnrollments created when admin stage ends
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queues the DB calls made by POST /api/admin/stages/[id]/end when the stage
 * being ended is Admin Stage 1 (order 2) and the next pending stage is the
 * Supplementary stage (order 3).
 *
 * DB call order in end/route.ts (admin → supplementary path):
 *   1.  select stage                    — fetch admin stage 1
 *   2.  update stages                   — set status = "completed"
 *   3.  select next pending stage       — finds supplementary stage (order 3)
 *   4.  update stages                   — activate supplementary stage
 *   5.  select prevAdminStage           — most recently completed admin stage
 *   6.  select completedRegistrations   — 3 students with completed registrations
 *   7.  insert stageEnrollments         — enroll Emma (reg 0)
 *   8.  insert stageEnrollments         — enroll Carlos (reg 1)
 *   9.  insert stageEnrollments         — enroll Hans (reg 2)
 *   10. select assignmentResult         — Emma's destination (London) for email
 *   11. select assignmentResult         — Carlos's destination (Barcelona) for email
 *   12. select assignmentResult         — Hans's destination (Berlin) for email
 */
function queueAdminStageEndsWithSupplementaryNext() {
  dbQueue.push(
    // 1. Current stage — Admin Stage 1, order 2
    [{
      id: WINTER_STAGE_ADMIN1_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 1",
      type: "admin",
      status: "active",
      order: 2,
    }],
    // 2. update stages → completed
    [],
    // 3. Next pending stage — Supplementary, order 3
    [{
      id: WINTER_STAGE_SUPP_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Supplementary Stage",
      type: "supplementary",
      status: "pending",
      order: 3,
      endDate: SUPP_END_DATE,
    }],
    // 4. update supplementary stage → active
    [],
    // 5. Previous completed admin stage (for email destination lookup)
    [{
      id: WINTER_STAGE_ADMIN1_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      type: "admin",
      status: "completed",
      order: 2,
    }],
    // 6. Completed registrations — 3 students
    [
      {
        id: REG_EMMA,
        slotId: WINTER_SLOT_IDS[0],
        studentEmail: "emma.johnson@student.edu",
        studentName: "Emma Johnson",
        studentLocale: "en",
      },
      {
        id: REG_CARLOS,
        slotId: WINTER_SLOT_IDS[1],
        studentEmail: "carlos.garcia@student.edu",
        studentName: "Carlos Garcia",
        studentLocale: "es",
      },
      {
        id: REG_HANS,
        slotId: WINTER_SLOT_IDS[2],
        studentEmail: "hans.weber@student.edu",
        studentName: "Hans Weber",
        studentLocale: "de",
      },
    ],
    // 7. Insert stageEnrollments for Emma
    [],
    // 8. Insert stageEnrollments for Carlos
    [],
    // 9. Insert stageEnrollments for Hans
    [],
    // 10. Destination for Emma's email — London
    [{ destinationName: "London University" }],
    // 11. Destination for Carlos's email — Barcelona
    [{ destinationName: "Barcelona University" }],
    // 12. Destination for Hans's email — Berlin
    [{ destinationName: "Berlin University" }],
  );
}

describe("POST /api/admin/stages/[id]/end — admin stage → supplementary stage", () => {
  it("inserts a stageEnrollments row for every completed registration", async () => {
    queueAdminStageEndsWithSupplementaryNext();

    // Record which insert calls hit the DB so we can verify enrollment inserts
    const insertCalls: any[] = [];
    const originalShift = dbQueue.shift.bind(dbQueue);

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN1_ID}/end`,
      { method: "POST" },
    );
    const res = await endPOST(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN1_ID }),
    });

    expect(res.status).toBe(200);

    // After the route runs all DB calls should have been consumed (queue empty)
    expect(dbQueue.length).toBe(0);
  });

  it("sends sendSupplementaryStageEmail to all 3 students with their current destination", async () => {
    queueAdminStageEndsWithSupplementaryNext();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN1_ID}/end`,
      { method: "POST" },
    );
    await endPOST(req, { params: Promise.resolve({ id: WINTER_STAGE_ADMIN1_ID }) });

    expect(mockSendSupplementaryStageEmail).toHaveBeenCalledTimes(3);

    expect(mockSendSupplementaryStageEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "emma.johnson@student.edu",
        fullName: "Emma Johnson",
        currentDestination: "London University",
        locale: "en",
      }),
    );
    expect(mockSendSupplementaryStageEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "carlos.garcia@student.edu",
        fullName: "Carlos Garcia",
        currentDestination: "Barcelona University",
        locale: "es",
      }),
    );
    expect(mockSendSupplementaryStageEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hans.weber@student.edu",
        fullName: "Hans Weber",
        currentDestination: "Berlin University",
        locale: "de",
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — applications/route.ts: Approved column pre-populated from previous
//           admin stage when the new admin stage has no assignment results yet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queues the DB calls made by GET /api/admin/stages/[id]/applications for
 * Admin Stage 2 (order 4) when the assignment algorithm has not yet run
 * (existingAssignments is empty) and there is one student with a guaranteed
 * destination (Emma kept her place; Carlos and Hans cancelled).
 *
 * DB call order in applications/route.ts:
 *   1.  select stage                  — fetch Admin Stage 2 (order 4)
 *   2.  select recruitment            — maxDestinationChoices
 *   3.  select allDestinations        — all destinations for the recruitment
 *   4.  select completedRows          — (parallel) completed registrations
 *   5.  select incompleteRows         — (parallel) incomplete registrations
 *   6.  select existingAssignments    — [] empty (algorithm not run yet)
 *   7.  select prevSupplementaryStage — Supplementary (order 3)
 *   8.  select prevAdminStage         — Admin Stage 1 (order 2)
 *   9.  select allSuppEnrollments     — enrollments in supp stage (Emma: not cancelled, Carlos+Hans: cancelled)
 *   10. select prevApproved           — approved assignment results from Admin Stage 1 for non-cancelled
 *   11. select nextSupplementary      — any pending supplementary after Admin Stage 2
 */
function queueApplicationsForAdmin2BeforeAlgorithm() {
  dbQueue.push(
    // 1. Admin Stage 2 — order 4, active, no results yet
    [{
      id: WINTER_STAGE_ADMIN2_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 2",
      type: "admin",
      status: "active",
      order: 4,
    }],
    // 2. Recruitment settings
    [{ maxDestinationChoices: 3 }],
    // 3. All destinations
    [
      { id: WINTER_DEST_LONDON_ID, name: "London University" },
      { id: WINTER_DEST_BERLIN_ID, name: "Berlin University" },
      { id: WINTER_DEST_BARCELONA_ID, name: "Barcelona University" },
    ],
    // 4. Completed registrations (Promise.all — consumed first)
    [
      {
        registrationId: REG_EMMA,
        slotId: WINTER_SLOT_IDS[0],
        slotNumber: 1,
        studentName: "Emma Johnson",
        enrollmentId: "100006",
        level: "bachelor",
        spokenLanguages: JSON.stringify(["English"]),
        destinationPreferences: JSON.stringify([WINTER_DEST_LONDON_ID, WINTER_DEST_BERLIN_ID]),
        averageResult: "4.5",
        additionalActivities: 2,
        recommendationLetters: 4,
      },
      {
        registrationId: REG_CARLOS,
        slotId: WINTER_SLOT_IDS[1],
        slotNumber: 2,
        studentName: "Carlos Garcia",
        enrollmentId: "100007",
        level: "master",
        spokenLanguages: JSON.stringify(["Spanish", "English"]),
        destinationPreferences: JSON.stringify([WINTER_DEST_BARCELONA_ID, WINTER_DEST_LONDON_ID]),
        averageResult: "5.0",
        additionalActivities: 3,
        recommendationLetters: 6,
      },
      {
        registrationId: REG_HANS,
        slotId: WINTER_SLOT_IDS[2],
        slotNumber: 3,
        studentName: "Hans Weber",
        enrollmentId: "100008",
        level: "master",
        spokenLanguages: JSON.stringify(["German"]),
        destinationPreferences: JSON.stringify([WINTER_DEST_BERLIN_ID]),
        averageResult: "3.0",
        additionalActivities: 1,
        recommendationLetters: 3,
      },
    ],
    // 5. Incomplete registrations (Promise.all — consumed second)
    [],
    // 6. Existing assignment results for Admin Stage 2 → empty (not run yet)
    [],
    // 7. Previous supplementary stage (order 3)
    [{
      id: WINTER_STAGE_SUPP_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      type: "supplementary",
      status: "completed",
      order: 3,
    }],
    // 8. Previous admin stage (order 2) — Admin Stage 1
    [{
      id: WINTER_STAGE_ADMIN1_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      type: "admin",
      status: "completed",
      order: 2,
    }],
    // 9. Supplementary stage enrollments:
    //    Emma (not cancelled) → her previous assignment is guaranteed
    //    Carlos + Hans (cancelled) → they re-enter the pool
    [
      { registrationId: REG_EMMA, cancelled: false },
      { registrationId: REG_CARLOS, cancelled: true },
      { registrationId: REG_HANS, cancelled: true },
    ],
    // 10. Approved results from Admin Stage 1 for guaranteed (non-cancelled) students:
    //    Emma was assigned London in Admin Stage 1
    [
      { registrationId: REG_EMMA, destinationId: WINTER_DEST_LONDON_ID },
    ],
    // 11. Next supplementary stage after Admin Stage 2 → none
    [],
  );
}

describe("GET /api/admin/stages/[id]/applications — guaranteed destinations pre-populated", () => {
  it("returns 200 and applications for the admin stage", async () => {
    queueApplicationsForAdmin2BeforeAlgorithm();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/applications`,
      { method: "GET" },
    );
    const res = await applicationsGET(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }),
    });

    expect(res.status).toBe(200);
  });

  it("pre-populates Emma's Approved destination from Admin Stage 1 (guaranteed, not cancelled)", async () => {
    queueApplicationsForAdmin2BeforeAlgorithm();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/applications`,
      { method: "GET" },
    );
    const res = await applicationsGET(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }),
    });

    const body = await res.json();
    const emma = body.applications.find(
      (a: any) => a.registrationId === REG_EMMA
    );

    expect(emma).toBeDefined();
    expect(emma.assignedDestinationId).toBe(WINTER_DEST_LONDON_ID);
    expect(emma.assignedDestinationName).toBe("London University");
  });

  it("shows no pre-populated destination for Carlos and Hans (cancelled during supplementary stage)", async () => {
    queueApplicationsForAdmin2BeforeAlgorithm();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/applications`,
      { method: "GET" },
    );
    const res = await applicationsGET(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }),
    });

    const body = await res.json();
    const carlos = body.applications.find(
      (a: any) => a.registrationId === REG_CARLOS
    );
    const hans = body.applications.find(
      (a: any) => a.registrationId === REG_HANS
    );

    expect(carlos?.assignedDestinationId).toBeNull();
    expect(hans?.assignedDestinationId).toBeNull();
  });

  it("reports hasAssignments: false when the algorithm has not yet run", async () => {
    queueApplicationsForAdmin2BeforeAlgorithm();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/applications`,
      { method: "GET" },
    );
    const res = await applicationsGET(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }),
    });

    const body = await res.json();
    expect(body.hasAssignments).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — applications/route.ts: fallback when supplementary stage has zero
//           enrollments (enrollment creation was missed — legacy data scenario)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queues the DB calls when allSuppEnrollments is empty (enrollment rows were
 * never created). In this case the route treats ALL students as guaranteed and
 * pre-populates the Approved column from Admin Stage 1 for every student.
 *
 * Differs from queueApplicationsForAdmin2BeforeAlgorithm only at step 9
 * (allSuppEnrollments returns []) and step 10 (prevApproved returns all 3 results).
 */
function queueApplicationsForAdmin2NoEnrollments() {
  dbQueue.push(
    // 1. Admin Stage 2
    [{
      id: WINTER_STAGE_ADMIN2_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      name: "Winter Admin Stage 2",
      type: "admin",
      status: "active",
      order: 4,
    }],
    // 2. Recruitment settings
    [{ maxDestinationChoices: 3 }],
    // 3. Destinations
    [
      { id: WINTER_DEST_LONDON_ID, name: "London University" },
      { id: WINTER_DEST_BERLIN_ID, name: "Berlin University" },
      { id: WINTER_DEST_BARCELONA_ID, name: "Barcelona University" },
    ],
    // 4. Completed rows
    [
      {
        registrationId: REG_EMMA,
        slotId: WINTER_SLOT_IDS[0],
        slotNumber: 1,
        studentName: "Emma Johnson",
        enrollmentId: "100006",
        level: "bachelor",
        spokenLanguages: JSON.stringify(["English"]),
        destinationPreferences: JSON.stringify([WINTER_DEST_LONDON_ID]),
        averageResult: "4.5",
        additionalActivities: 2,
        recommendationLetters: 4,
      },
      {
        registrationId: REG_CARLOS,
        slotId: WINTER_SLOT_IDS[1],
        slotNumber: 2,
        studentName: "Carlos Garcia",
        enrollmentId: "100007",
        level: "master",
        spokenLanguages: JSON.stringify(["Spanish", "English"]),
        destinationPreferences: JSON.stringify([WINTER_DEST_BARCELONA_ID]),
        averageResult: "5.0",
        additionalActivities: 3,
        recommendationLetters: 6,
      },
    ],
    // 5. Incomplete rows
    [],
    // 6. Existing assignments → empty
    [],
    // 7. Previous supplementary stage
    [{
      id: WINTER_STAGE_SUPP_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      type: "supplementary",
      status: "completed",
      order: 3,
    }],
    // 8. Previous admin stage
    [{
      id: WINTER_STAGE_ADMIN1_ID,
      recruitmentId: WINTER_RECRUITMENT_ID,
      type: "admin",
      status: "completed",
      order: 2,
    }],
    // 9. Supplementary enrollments → EMPTY (legacy data / enrollment creation missed)
    [],
    // 10. All approved results from Admin Stage 1 (all students treated as guaranteed)
    [
      { registrationId: REG_EMMA, destinationId: WINTER_DEST_LONDON_ID },
      { registrationId: REG_CARLOS, destinationId: WINTER_DEST_BARCELONA_ID },
    ],
    // 11. Next supplementary
    [],
  );
}

describe("GET /api/admin/stages/[id]/applications — fallback when supplementary enrollments are missing", () => {
  it("pre-populates ALL students' destinations when supplementary stage has no enrollments", async () => {
    queueApplicationsForAdmin2NoEnrollments();

    const req = new NextRequest(
      `http://localhost/api/admin/stages/${WINTER_STAGE_ADMIN2_ID}/applications`,
      { method: "GET" },
    );
    const res = await applicationsGET(req, {
      params: Promise.resolve({ id: WINTER_STAGE_ADMIN2_ID }),
    });

    expect(res.status).toBe(200);

    const body = await res.json();
    const emma = body.applications.find((a: any) => a.registrationId === REG_EMMA);
    const carlos = body.applications.find((a: any) => a.registrationId === REG_CARLOS);

    expect(emma?.assignedDestinationId).toBe(WINTER_DEST_LONDON_ID);
    expect(emma?.assignedDestinationName).toBe("London University");

    expect(carlos?.assignedDestinationId).toBe(WINTER_DEST_BARCELONA_ID);
    expect(carlos?.assignedDestinationName).toBe("Barcelona University");
  });
});
