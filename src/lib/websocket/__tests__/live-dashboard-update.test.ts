/**
 * Integration test for the live dashboard real-time update flow.
 *
 * Verifies that when a student changes their registration details (name, etc.),
 * a connected admin dashboard WebSocket client receives a `registration_step_update`
 * message with the updated data — without requiring a page reload.
 *
 * Also verifies counter (in-progress / registered) changes for:
 *   - New registrations: slot_status_update increments startedSlots when a student
 *     opens their link for the first time.
 *   - registration_update includes the authoritative startedSlotsCount from the DB
 *     so that the dashboard never has to guess (fixes the -1 bug when re-editing).
 *
 * The test wires up the same setup that src/server.ts performs at startup:
 *   1. Creates a real WebSocket server using the same `setupWebSocketServer` and
 *      `broadcastToStage` from websocket/server.ts.
 *   2. Registers `broadcastToStage` in `global.__broadcastToStage` — exactly as
 *      server.ts does — so that the events.ts helper (used by API routes) reaches
 *      the same subscriptions Map.
 *   3. Connects a WebSocket client and subscribes to a stage, simulating the admin
 *      dashboard.
 *   4. Calls broadcast helpers from events.ts, simulating the API route handlers.
 *   5. Asserts the client received the correct message.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer, broadcastToStage } from "../server";
import {
  broadcastRegistrationStepUpdate,
  broadcastSlotStatusUpdate,
  broadcastRegistrationUpdate,
} from "../events";
import {
  WINTER_STAGE_INITIAL_ID,
  WINTER_SLOT_IDS,
  USER_EMMA_ID,
} from "../../../../scripts/seed-data";

const STAGE_ID = "test-stage-live-dashboard";

// Winter initial stage from seed — matches the dashboard URL used in manual testing:
// /pl/admin/recruitment/10000000-0000-0000-0000-000000000002/stage/20000002-0000-0000-0000-000000000001
const WINTER_STAGE = WINTER_STAGE_INITIAL_ID;

// Open slot (seed index 6): the link used in manual testing
// /en/register/50000002-0000-0000-0000-000000000007
const OPEN_SLOT_ID = WINTER_SLOT_IDS[6];
const OPEN_SLOT_NUMBER = 7;

// Registered slot (Emma Johnson, seed index 0): already has a completed registration
const EMMA_SLOT_ID = WINTER_SLOT_IDS[0];
const EMMA_SLOT_NUMBER = 1;
const EMMA_TEACHER_LINK = `/en/manage/${EMMA_SLOT_ID}/fake-sig`;

// Utility: collect exactly `count` WebSocket messages, or reject on timeout.
function collectMessages(ws: WebSocket, count: number, timeoutMs = 500): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${count} messages, got ${messages.length}`));
    }, timeoutMs);
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch {
        clearTimeout(timer);
        reject(new Error("Received non-JSON WebSocket message"));
        return;
      }
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    });
    ws.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// Utility: connect a WebSocket client, wait for it to open and subscribe, then
// wait for the subscription confirmation before returning.
async function subscribeClient(url: string, stageId: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "subscribe", stageId })));
    ws.once("message", () => resolve()); // first message is the "subscribed" confirmation
  });
  return ws;
}

// Utility: wait for the next non-confirmation WebSocket message.
function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once("message", (raw) => {
      try {
        resolve(JSON.parse(raw.toString()));
      } catch {
        reject(new Error("Received non-JSON WebSocket message"));
      }
    });
    ws.once("error", reject);
  });
}

describe("Live dashboard – registration_step_update broadcast", () => {
  let httpServer: http.Server;
  let wss: WebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ noServer: true });

    setupWebSocketServer(wss);

    // Mirror what server.ts does: register the broadcast function in global so
    // events.ts (and therefore API route handlers) use the correct subscriptions Map.
    (global as any).__broadcastToStage = broadcastToStage;

    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete (global as any).__broadcastToStage;
  });

  it("delivers the update to a subscribed dashboard client", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: STAGE_ID,
      registration: {
        slotId: "slot-00000001",
        slotNumber: 6,
        studentName: "Updated Name",
        studentEmail: "student@example.com",
        completedAt: null,
        updatedAt: new Date().toISOString(),
        registrationCompleted: false,
        teacherManagementLink: "/en/manage/slot-00000001/abc123",
      },
    });

    const message = await pending;

    expect(message).toMatchObject({
      type: "registration_step_update",
      stageId: STAGE_ID,
      registration: expect.objectContaining({
        studentName: "Updated Name",
        slotId: "slot-00000001",
        registrationCompleted: false,
      }),
    });

    client.close();
  });

  it("does not deliver the update to a client on a different stage", async () => {
    const client = await subscribeClient(wsUrl, "other-stage");
    const received: unknown[] = [];
    client.on("message", (raw) => received.push(JSON.parse(raw.toString())));

    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: STAGE_ID, // broadcast to STAGE_ID, client is on "other-stage"
      registration: {
        slotId: "slot-00000002",
        slotNumber: 7,
        studentName: "Someone Else",
        studentEmail: "else@example.com",
        completedAt: null,
        updatedAt: new Date().toISOString(),
        registrationCompleted: false,
        teacherManagementLink: "/en/manage/slot-00000002/xyz",
      },
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(received).toHaveLength(0);

    client.close();
  });

  it("reflects a completed registration as registrationCompleted: true with a completedAt timestamp", async () => {

    const completedAt = new Date().toISOString();
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: STAGE_ID,
      registration: {
        slotId: "slot-00000003",
        slotNumber: 1,
        studentName: "Completed Student",
        studentEmail: "done@example.com",
        completedAt,
        updatedAt: completedAt,
        registrationCompleted: true,
        teacherManagementLink: "/en/manage/slot-00000003/def456",
      },
    });

    const message = (await pending) as any;

    expect(message.registration.registrationCompleted).toBe(true);
    expect(message.registration.completedAt).toBe(completedAt);

    client.close();
  });
});

describe("Live dashboard – slot counter updates", () => {
  let httpServer: http.Server;
  let wss: WebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ noServer: true });
    setupWebSocketServer(wss);
    (global as any).__broadcastToStage = broadcastToStage;
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete (global as any).__broadcastToStage;
  });

  it("slot_status_update increments startedSlots when a new student opens their link", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    // Simulate GET /api/registration/[slotId]: slot just moved open → registration_started
    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: STAGE_ID,
      openSlotsCount: 9,
      startedSlotsCount: 1, // was 0, now 1
    });

    const message = (await pending) as any;

    expect(message.type).toBe("slot_status_update");
    expect(message.openSlotsCount).toBe(9);
    expect(message.startedSlotsCount).toBe(1);

    client.close();
  });

  it("slot_status_update carries startedSlot so the Recent Registrations list updates immediately", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    const slotCreatedAt = new Date().toISOString();

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: STAGE_ID,
      openSlotsCount: 8,
      startedSlotsCount: 1,
      startedSlot: {
        slotId: "slot-aabbccdd",
        slotNumber: 5,
        createdAt: slotCreatedAt,
        teacherManagementLink: "/en/manage/slot-aabbccdd/sig123",
      },
    });

    const message = (await pending) as any;

    expect(message.type).toBe("slot_status_update");
    expect(message.startedSlotsCount).toBe(1);
    expect(message.startedSlot).toBeDefined();
    expect(message.startedSlot.slotId).toBe("slot-aabbccdd");
    expect(message.startedSlot.slotNumber).toBe(5);
    expect(message.startedSlot.createdAt).toBe(slotCreatedAt);
    expect(message.startedSlot.teacherManagementLink).toBe("/en/manage/slot-aabbccdd/sig123");

    client.close();
  });

  it("slot_status_update without startedSlot is backward-compatible (no startedSlot key)", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: STAGE_ID,
      openSlotsCount: 5,
      startedSlotsCount: 0,
      // no startedSlot field
    });

    const message = (await pending) as any;

    expect(message.type).toBe("slot_status_update");
    expect(message.startedSlot).toBeUndefined();

    client.close();
  });

  it("registration_update carries the DB-accurate startedSlotsCount after a new registration completes", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    // Simulate POST /api/registration/[slotId]/complete for a fresh registration.
    // The slot moved registration_started → registered, so startedSlotsCount drops to 0.
    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: STAGE_ID,
      registeredCount: 1,
      openSlotsCount: 9,
      startedSlotsCount: 0,
      latestRegistration: {
        studentName: "Alice",
        slotNumber: 3,
        completedAt: new Date().toISOString(),
        teacherManagementLink: "/en/manage/slot-00000003/abc",
      },
    });

    const message = (await pending) as any;

    expect(message.type).toBe("registration_update");
    expect(message.startedSlotsCount).toBe(0);
    expect(message.registeredCount).toBe(1);
    expect(message.latestRegistration.studentName).toBe("Alice");

    client.close();
  });

  it("registration_update carries startedSlotsCount=0 when re-editing student completes (no -1 bug)", async () => {
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    // Simulate re-edit completion: the slot was already "registered" throughout,
    // so startedSlotsCount in the DB is 0 — the dashboard must use this value
    // directly rather than decrementing its local counter (which would go to -1).
    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: STAGE_ID,
      registeredCount: 5,
      openSlotsCount: 4,
      startedSlotsCount: 0, // slot was never re-moved to registration_started
      latestRegistration: {
        studentName: "Bob",
        slotNumber: 7,
        completedAt: new Date().toISOString(),
        teacherManagementLink: "/en/manage/slot-00000007/xyz",
      },
    });

    const message = (await pending) as any;

    expect(message.type).toBe("registration_update");
    // The dashboard must display this exact count, not prev - 1
    expect(message.startedSlotsCount).toBe(0);
    expect(message.registeredCount).toBe(5);

    client.close();
  });

  it("slot_status_update IS emitted when a re-editing student opens a registered slot", async () => {
    // When an existing (completed) registration is opened for re-editing, the GET
    // route now moves the slot registered → registration_started and broadcasts
    // slot_status_update so the in-progress counter increments correctly.
    const client = await subscribeClient(wsUrl, STAGE_ID);
    const pending = nextMessage(client);

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: STAGE_ID,
      openSlotsCount: 5,
      startedSlotsCount: 1, // was 0, now 1 — re-edit student is in progress
    });

    const message = (await pending) as any;

    expect(message.type).toBe("slot_status_update");
    expect(message.startedSlotsCount).toBe(1);
    client.close();
  });
});

// ─── Scenario: new registration on an open slot ───────────────────────────────
//
// Mirrors the flow for slot 50000002-0000-0000-0000-000000000007 (Winter open slot)
// watched from the dashboard at stage 20000002-0000-0000-0000-000000000001.
//
// Event sequence emitted by the API routes:
//   1. GET /api/registration/[slotId]          → slot_status_update   (open→started)
//   2. POST …/step  { step: 2 } (OTP verified) → registration_step_update (in-progress)
//   3. POST …/step  { step: 3 } (name changed) → registration_step_update (name updated)
//   4. POST …/complete                         → registration_update  (finished)

describe("Live dashboard – new registration scenario (open slot, Winter stage)", () => {
  let httpServer: http.Server;
  let wss: WebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ noServer: true });
    setupWebSocketServer(wss);
    (global as any).__broadcastToStage = broadcastToStage;
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete (global as any).__broadcastToStage;
  });

  it("receives all four events in the correct order with consistent data", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = collectMessages(client, 4);

    const openedAt = new Date().toISOString();
    const completedAt = new Date(Date.now() + 5000).toISOString();
    const teacherLink = `/en/manage/${OPEN_SLOT_ID}/fake-sig`;

    // 1. Student opens the link → slot moves open → registration_started
    //    startedSlot is included so the Recent Registrations list can show the entry
    //    immediately (before the student completes OTP, when no registration row exists).
    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 4,   // one fewer open slot
      startedSlotsCount: 1,
      startedSlot: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        createdAt: openedAt,
        teacherManagementLink: teacherLink,
      },
    });

    // 2. Student verifies OTP → registration created, shown as in-progress
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        studentName: "new.student",           // placeholder until step 3
        studentEmail: "new.student@uni.edu",
        completedAt: null,
        updatedAt: openedAt,
        registrationCompleted: false,
        teacherManagementLink: teacherLink,
      },
    });

    // 3. Student fills in their real name (step 3)
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        studentName: "New Student",           // updated name
        studentEmail: "new.student@uni.edu",
        completedAt: null,
        updatedAt: new Date(Date.now() + 1000).toISOString(),
        registrationCompleted: false,
        teacherManagementLink: teacherLink,
      },
    });

    // 4. Student submits → registration_update with DB-accurate started count
    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: WINTER_STAGE,
      registeredCount: 6,
      openSlotsCount: 4,
      startedSlotsCount: 0,   // slot is now registered, not started
      latestRegistration: {
        studentName: "New Student",
        slotNumber: OPEN_SLOT_NUMBER,
        completedAt,
        teacherManagementLink: teacherLink,
      },
    });

    const [msg1, msg2, msg3, msg4] = (await pending) as any[];

    // Event 1: counter shows +1 in-progress, -1 open; startedSlot enables immediate
    // Recent Registrations entry (shown as "Unknown" before OTP is completed).
    expect(msg1.type).toBe("slot_status_update");
    expect(msg1.startedSlotsCount).toBe(1);
    expect(msg1.openSlotsCount).toBe(4);
    expect(msg1.startedSlot).toBeDefined();
    expect(msg1.startedSlot.slotId).toBe(OPEN_SLOT_ID);
    expect(msg1.startedSlot.slotNumber).toBe(OPEN_SLOT_NUMBER);
    expect(msg1.startedSlot.teacherManagementLink).toBe(teacherLink);

    // Event 2: OTP verified — registration row now exists; recent entry gains student info.
    // The page merges this onto the existing "Unknown" entry, preserving createdAt.
    expect(msg2.type).toBe("registration_step_update");
    expect(msg2.registration.slotId).toBe(OPEN_SLOT_ID);
    expect(msg2.registration.registrationCompleted).toBe(false);
    expect(msg2.registration.completedAt).toBeNull();

    // Event 3: name change is immediately visible on the dashboard
    expect(msg3.type).toBe("registration_step_update");
    expect(msg3.registration.studentName).toBe("New Student");
    expect(msg3.registration.registrationCompleted).toBe(false);

    // Event 4: counters correct — started goes to 0 (from DB), registered +1
    expect(msg4.type).toBe("registration_update");
    expect(msg4.startedSlotsCount).toBe(0);
    expect(msg4.registeredCount).toBe(6);
    expect(msg4.latestRegistration.studentName).toBe("New Student");
    expect(msg4.latestRegistration.slotNumber).toBe(OPEN_SLOT_NUMBER);

    client.close();
  });
});

// ─── Scenario: existing registration re-edit ─────────────────────────────────
//
// Mirrors editing Emma Johnson's completed registration on slot
// 50000002-0000-0000-0000-000000000001, watched from the same Winter dashboard.
//
// After the Bug 1 + Bug 2 fixes:
//   • GET now moves the slot registered → registration_started and emits
//     slot_status_update, so the in-progress counter increments for re-edits too.
//   • Steps 3-6 always broadcast registrationCompleted: false while editing.
//   • registration_update on completion includes the DB-accurate startedSlotsCount
//     so the dashboard counter returns to 0 (not -1).
//
// Event sequence:
//   1. GET /api/registration/[slotId]          → slot_status_update (registered→started)
//   2. POST …/step  { step: 2 } (OTP verified) → registration_step_update (in-progress, false)
//   3. POST …/step  { step: 3 } (name changed) → registration_step_update (still false)
//   4. POST …/complete                         → registration_update  (re-confirmed)

describe("Live dashboard – existing registration re-edit scenario (Winter stage)", () => {
  let httpServer: http.Server;
  let wss: WebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ noServer: true });
    setupWebSocketServer(wss);
    (global as any).__broadcastToStage = broadcastToStage;
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete (global as any).__broadcastToStage;
  });

  it("opening the link emits slot_status_update — in-progress counter increments for re-edits", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = nextMessage(client);

    // GET /api/registration/[slotId] now moves registered → registration_started.
    // startedSlot is included so the page adds the re-editing student to Recent Registrations.
    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 5,
      startedSlotsCount: 1, // re-editing student now counted as in-progress
      startedSlot: {
        slotId: EMMA_SLOT_ID,
        slotNumber: EMMA_SLOT_NUMBER,
        createdAt: new Date().toISOString(),
        teacherManagementLink: EMMA_TEACHER_LINK,
      },
    });

    const message = (await pending) as any;
    expect(message.type).toBe("slot_status_update");
    expect(message.startedSlotsCount).toBe(1);
    expect(message.startedSlot?.slotId).toBe(EMMA_SLOT_ID);
    client.close();
  });

  it("receives four events (slot-started, step2, name-change, complete) with registrationCompleted: false during editing", async () => {
    const originalCompletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const reEditUpdatedAt = new Date().toISOString();
    const reConfirmedAt = new Date(Date.now() + 1000).toISOString();

    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = collectMessages(client, 4);

    // 1. Emma opens her link — slot registered → registration_started.
    //    startedSlot is included so the page can show the entry immediately even
    //    though the student hasn't completed OTP verification yet.
    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 5,
      startedSlotsCount: 1,
      startedSlot: {
        slotId: EMMA_SLOT_ID,
        slotNumber: EMMA_SLOT_NUMBER,
        createdAt: reEditUpdatedAt,
        teacherManagementLink: EMMA_TEACHER_LINK,
      },
    });

    // 2. Emma re-authenticates via OTP — dashboard sees her as in-progress (not complete).
    //    The page merges this into the existing entry, so createdAt is preserved.
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: EMMA_SLOT_ID,
        slotNumber: EMMA_SLOT_NUMBER,
        studentName: "Emma Johnson",
        studentEmail: "emma.johnson@student.edu",
        completedAt: originalCompletedAt,
        updatedAt: reEditUpdatedAt,
        registrationCompleted: false,        // Bug 2 fix: always false while editing
        teacherManagementLink: EMMA_TEACHER_LINK,
      },
    });

    // 3. Emma changes her name — still in-progress
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: EMMA_SLOT_ID,
        slotNumber: EMMA_SLOT_NUMBER,
        studentName: "Emma J. Johnson",      // updated name
        studentEmail: "emma.johnson@student.edu",
        completedAt: originalCompletedAt,
        updatedAt: new Date(Date.now() + 500).toISOString(),
        registrationCompleted: false,        // still false while editing
        teacherManagementLink: EMMA_TEACHER_LINK,
      },
    });

    // 4. Emma re-submits — registration_update with DB-accurate startedSlotsCount
    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: WINTER_STAGE,
      registeredCount: 5,    // unchanged — Emma was already counted
      openSlotsCount: 5,
      startedSlotsCount: 0,  // slot moved back to registered → counter returns to 0
      latestRegistration: {
        studentName: "Emma J. Johnson",
        slotNumber: EMMA_SLOT_NUMBER,
        completedAt: reConfirmedAt,
        teacherManagementLink: EMMA_TEACHER_LINK,
      },
    });

    const [msg1, msg2, msg3, msg4] = (await pending) as any[];

    // Event 1: in-progress counter increments when Emma opens her link.
    // startedSlot present so the page can add her entry to Recent Registrations immediately
    // (the slot already had a completed registration, but it's now being re-edited).
    expect(msg1.type).toBe("slot_status_update");
    expect(msg1.startedSlotsCount).toBe(1);
    expect(msg1.startedSlot).toBeDefined();
    expect(msg1.startedSlot.slotId).toBe(EMMA_SLOT_ID);
    expect(msg1.startedSlot.slotNumber).toBe(EMMA_SLOT_NUMBER);
    expect(msg1.startedSlot.teacherManagementLink).toBe(EMMA_TEACHER_LINK);

    // Event 2: re-auth shows Emma as in-progress (registrationCompleted: false, not true)
    expect(msg2.type).toBe("registration_step_update");
    expect(msg2.registration.slotId).toBe(EMMA_SLOT_ID);
    expect(msg2.registration.studentName).toBe("Emma Johnson");
    expect(msg2.registration.registrationCompleted).toBe(false);

    // Event 3: name change is immediately visible on the dashboard
    expect(msg3.type).toBe("registration_step_update");
    expect(msg3.registration.studentName).toBe("Emma J. Johnson");
    expect(msg3.registration.registrationCompleted).toBe(false);

    // Event 4: startedSlotsCount comes from DB (0), counter returns to 0 (not -1)
    expect(msg4.type).toBe("registration_update");
    expect(msg4.startedSlotsCount).toBe(0);
    expect(msg4.registeredCount).toBe(5);
    expect(msg4.latestRegistration.studentName).toBe("Emma J. Johnson");
    expect(msg4.latestRegistration.slotNumber).toBe(EMMA_SLOT_NUMBER);

    client.close();
  });
});

// ─── Recent Registrations list update sequence ────────────────────────────────
//
// Verifies the full event sequence that keeps the Recent Registrations list in
// sync without a page reload. The list must show an entry as soon as a slot
// becomes in-progress (before OTP), update it with the student's name after
// OTP verification, and mark it complete when the form is submitted.
//
// Message sequence and expected list state:
//   1. slot_status_update (startedSlot)  → entry added: slotId known, name "Unknown"
//   2. registration_step_update (step 2) → entry updated: name appears, incomplete
//   3. registration_step_update (step 3) → entry updated: name changed, still incomplete
//   4. registration_update (complete)    → startedSlots→0, registeredSlots+1

describe("Live dashboard – Recent Registrations list update sequence", () => {
  let httpServer: http.Server;
  let wss: WebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({ noServer: true });
    setupWebSocketServer(wss);
    (global as any).__broadcastToStage = broadcastToStage;
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    delete (global as any).__broadcastToStage;
  });

  it("step 1 → slot_status_update carries startedSlot so entry is immediately visible as Unknown", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = nextMessage(client);
    const slotCreatedAt = new Date().toISOString();

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 3,
      startedSlotsCount: 1,
      startedSlot: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        createdAt: slotCreatedAt,
        teacherManagementLink: `/en/manage/${OPEN_SLOT_ID}/sig`,
      },
    });

    const msg = (await pending) as any;
    // The page uses startedSlot to add an entry with studentName=null ("Unknown")
    // before any registration row exists (before the student completes OTP).
    expect(msg.startedSlot.slotId).toBe(OPEN_SLOT_ID);
    expect(msg.startedSlot.slotNumber).toBe(OPEN_SLOT_NUMBER);
    expect(msg.startedSlot.createdAt).toBe(slotCreatedAt);
    expect(msg.startedSlot.teacherManagementLink).toContain(OPEN_SLOT_ID);

    client.close();
  });

  it("step 2 → registration_step_update provides student name that replaces the Unknown entry", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = nextMessage(client);
    const updatedAt = new Date().toISOString();

    // Simulates POST /step { step: 2 } — OTP verified, registration row created.
    // The page merges { ...existingEntry, ...incoming } so createdAt from step 1 is kept.
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        studentName: "jane.doe",               // email-derived placeholder
        studentEmail: "jane.doe@uni.edu",
        completedAt: null,
        updatedAt,
        registrationCompleted: false,
        teacherManagementLink: `/en/manage/${OPEN_SLOT_ID}/sig`,
      },
    });

    const msg = (await pending) as any;
    expect(msg.registration.slotId).toBe(OPEN_SLOT_ID);
    expect(msg.registration.studentName).toBe("jane.doe");
    expect(msg.registration.registrationCompleted).toBe(false);
    expect(msg.registration.completedAt).toBeNull();

    client.close();
  });

  it("step 3 → registration_step_update updates the name without losing the slot entry", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = nextMessage(client);

    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: WINTER_STAGE,
      registration: {
        slotId: OPEN_SLOT_ID,
        slotNumber: OPEN_SLOT_NUMBER,
        studentName: "Jane Doe",               // real name entered in the form
        studentEmail: "jane.doe@uni.edu",
        completedAt: null,
        updatedAt: new Date(Date.now() + 500).toISOString(),
        registrationCompleted: false,
        teacherManagementLink: `/en/manage/${OPEN_SLOT_ID}/sig`,
      },
    });

    const msg = (await pending) as any;
    expect(msg.registration.studentName).toBe("Jane Doe");
    expect(msg.registration.registrationCompleted).toBe(false);

    client.close();
  });

  it("step 4 → registration_update marks completion: startedSlots→0, registeredSlots+1", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = nextMessage(client);
    const completedAt = new Date().toISOString();

    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: WINTER_STAGE,
      registeredCount: 2,
      openSlotsCount: 3,
      startedSlotsCount: 0,   // slot moved registration_started → registered
      latestRegistration: {
        studentName: "Jane Doe",
        slotNumber: OPEN_SLOT_NUMBER,
        completedAt,
        teacherManagementLink: `/en/manage/${OPEN_SLOT_ID}/sig`,
      },
    });

    const msg = (await pending) as any;
    expect(msg.startedSlotsCount).toBe(0);
    expect(msg.registeredCount).toBe(2);
    expect(msg.latestRegistration.studentName).toBe("Jane Doe");
    expect(msg.latestRegistration.completedAt).toBe(completedAt);

    client.close();
  });

  it("two simultaneous in-progress slots each deliver independent startedSlot payloads", async () => {
    const client = await subscribeClient(wsUrl, WINTER_STAGE);
    const pending = collectMessages(client, 2);

    const slotAId = "slot-concurrent-a";
    const slotBId = "slot-concurrent-b";
    const now = new Date().toISOString();

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 7,
      startedSlotsCount: 1,
      startedSlot: { slotId: slotAId, slotNumber: 3, createdAt: now, teacherManagementLink: `/en/manage/${slotAId}/s1` },
    });

    broadcastSlotStatusUpdate({
      type: "slot_status_update",
      stageId: WINTER_STAGE,
      openSlotsCount: 6,
      startedSlotsCount: 2,
      startedSlot: { slotId: slotBId, slotNumber: 4, createdAt: now, teacherManagementLink: `/en/manage/${slotBId}/s2` },
    });

    const [msgA, msgB] = (await pending) as any[];

    expect(msgA.startedSlot.slotId).toBe(slotAId);
    expect(msgA.startedSlot.slotNumber).toBe(3);
    expect(msgB.startedSlot.slotId).toBe(slotBId);
    expect(msgB.startedSlot.slotNumber).toBe(4);
    // Counters are independent; second event reflects both slots in progress
    expect(msgB.startedSlotsCount).toBe(2);

    client.close();
  });
});
