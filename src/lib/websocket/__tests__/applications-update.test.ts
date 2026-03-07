/**
 * Integration tests for the application review grid real-time update flow.
 *
 * Two event types are verified:
 *
 *  application_row_update
 *    Emitted by PATCH /api/admin/registrations/[id] after a single registration
 *    is edited by an admin. The event carries the full updated Application row so
 *    clients can patch that row in-place without reloading the entire grid.
 *
 *  application_assignments_update
 *    Emitted by POST /api/admin/stages/[id]/assign after the assignment algorithm
 *    runs. Contains only the assignment columns (assignedDestinationId /
 *    assignedDestinationName) for every registration, plus summary counts, so
 *    clients can refresh just the Assigned column.
 *
 * The test harness mirrors src/server.ts: a real WebSocketServer is wired up with
 * the same setupWebSocketServer + global.__broadcastToStage pattern so that the
 * events.ts broadcast helpers hit the correct subscriptions Map.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer, broadcastToStage } from "../server";
import { broadcastApplicationRowUpdate, broadcastApplicationAssignmentsUpdate } from "../events";
import type { ApplicationRowUpdateEvent, ApplicationAssignmentsUpdateEvent } from "../events";

const STAGE_A = "test-stage-apps-a";
const STAGE_B = "test-stage-apps-b";

// ─── Sample data fixtures ──────────────────────────────────────────────────────

const BASE_APP: ApplicationRowUpdateEvent["application"] = {
  registrationId: "reg-00000001",
  slotNumber: 3,
  studentName: "Alice Smith",
  enrollmentId: "123456",
  level: "bachelor",
  spokenLanguages: ["English", "Spanish"],
  destinationPreferences: ["dest-aaa", "dest-bbb"],
  destinationNames: ["Madrid", "Berlin"],
  averageResult: 4.5,
  additionalActivities: 2,
  recommendationLetters: 1,
  score: 16.5,
  assignedDestinationId: "dest-aaa",
  assignedDestinationName: "Madrid",
  registrationCompleted: true,
};

const ASSIGNMENTS: ApplicationAssignmentsUpdateEvent["assignments"] = [
  { registrationId: "reg-00000001", assignedDestinationId: "dest-aaa", assignedDestinationName: "Madrid" },
  { registrationId: "reg-00000002", assignedDestinationId: null, assignedDestinationName: null },
  { registrationId: "reg-00000003", assignedDestinationId: "dest-bbb", assignedDestinationName: "Berlin" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function subscribeClient(url: string, stageId: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "subscribe", stageId })));
    ws.once("message", () => resolve()); // first message is the "subscribed" confirmation
  });
  return ws;
}

function nextMessage(ws: WebSocket, timeoutMs = 400): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for message")),
      timeoutMs
    );
    ws.once("message", (raw) => {
      clearTimeout(timer);
      try { resolve(JSON.parse(raw.toString())); }
      catch { reject(new Error("Non-JSON WebSocket message")); }
    });
    ws.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function collectMessages(ws: WebSocket, count: number, timeoutMs = 500): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Timed out: wanted ${count}, got ${messages.length}`)),
      timeoutMs
    );
    ws.on("message", (raw) => {
      try { messages.push(JSON.parse(raw.toString())); }
      catch { clearTimeout(timer); reject(new Error("Non-JSON WebSocket message")); return; }
      if (messages.length >= count) { clearTimeout(timer); resolve(messages); }
    });
    ws.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// ─── Shared server setup ──────────────────────────────────────────────────────

function makeServer() {
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  setupWebSocketServer(wss);
  (global as any).__broadcastToStage = broadcastToStage;
  httpServer.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
  return { httpServer, wss };
}

async function startServer(httpServer: http.Server): Promise<string> {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  return `ws://localhost:${port}`;
}

async function stopServer(wss: WebSocketServer, httpServer: http.Server): Promise<void> {
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  delete (global as any).__broadcastToStage;
}

// ═══════════════════════════════════════════════════════════════════════════════
// application_row_update
// ═══════════════════════════════════════════════════════════════════════════════

describe("application_row_update – delivery", () => {
  let wsUrl: string;
  let httpServer: http.Server;
  let wss: WebSocketServer;

  beforeAll(async () => {
    ({ httpServer, wss } = makeServer());
    wsUrl = await startServer(httpServer);
  });
  afterAll(() => stopServer(wss, httpServer));

  it("delivers the full application payload to a subscribed client", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = nextMessage(client);

    broadcastApplicationRowUpdate({
      type: "application_row_update",
      stageId: STAGE_A,
      application: BASE_APP,
    });

    const msg = (await pending) as any;

    expect(msg.type).toBe("application_row_update");
    expect(msg.stageId).toBe(STAGE_A);
    expect(msg.application).toMatchObject({
      registrationId: BASE_APP.registrationId,
      slotNumber: BASE_APP.slotNumber,
      studentName: BASE_APP.studentName,
      enrollmentId: BASE_APP.enrollmentId,
      level: BASE_APP.level,
      spokenLanguages: BASE_APP.spokenLanguages,
      destinationPreferences: BASE_APP.destinationPreferences,
      destinationNames: BASE_APP.destinationNames,
      averageResult: BASE_APP.averageResult,
      additionalActivities: BASE_APP.additionalActivities,
      recommendationLetters: BASE_APP.recommendationLetters,
      score: BASE_APP.score,
      assignedDestinationId: BASE_APP.assignedDestinationId,
      assignedDestinationName: BASE_APP.assignedDestinationName,
      registrationCompleted: BASE_APP.registrationCompleted,
    });

    client.close();
  });

  it("reflects updated student name when an admin renames a student", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = nextMessage(client);

    broadcastApplicationRowUpdate({
      type: "application_row_update",
      stageId: STAGE_A,
      application: { ...BASE_APP, studentName: "Alice M. Smith" },
    });

    const msg = (await pending) as any;
    expect(msg.application.studentName).toBe("Alice M. Smith");
    expect(msg.application.registrationId).toBe(BASE_APP.registrationId);

    client.close();
  });

  it("reflects updated score when teacher data changes", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = nextMessage(client);

    // averageResult 5.0, activities 3, letters 2 → score = 15 + 3 + 2 = 20
    broadcastApplicationRowUpdate({
      type: "application_row_update",
      stageId: STAGE_A,
      application: { ...BASE_APP, averageResult: 5.0, additionalActivities: 3, recommendationLetters: 2, score: 20 },
    });

    const msg = (await pending) as any;
    expect(msg.application.averageResult).toBe(5.0);
    expect(msg.application.additionalActivities).toBe(3);
    expect(msg.application.recommendationLetters).toBe(2);
    expect(msg.application.score).toBe(20);

    client.close();
  });

  it("does NOT deliver the event to a client on a different stage", async () => {
    const client = await subscribeClient(wsUrl, STAGE_B);
    const received: unknown[] = [];
    client.on("message", (raw) => received.push(JSON.parse(raw.toString())));

    broadcastApplicationRowUpdate({ type: "application_row_update", stageId: STAGE_A, application: BASE_APP });

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);

    client.close();
  });

  it("delivers to all simultaneous subscribers on the same stage", async () => {
    const [c1, c2, c3] = await Promise.all([
      subscribeClient(wsUrl, STAGE_A),
      subscribeClient(wsUrl, STAGE_A),
      subscribeClient(wsUrl, STAGE_A),
    ]);
    const [p1, p2, p3] = [nextMessage(c1), nextMessage(c2), nextMessage(c3)];

    broadcastApplicationRowUpdate({ type: "application_row_update", stageId: STAGE_A, application: BASE_APP });

    const msgs = (await Promise.all([p1, p2, p3])) as any[];
    for (const msg of msgs) {
      expect(msg.type).toBe("application_row_update");
      expect(msg.application.registrationId).toBe(BASE_APP.registrationId);
    }

    c1.close(); c2.close(); c3.close();
  });

  it("disconnected client does not receive subsequent events", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const received: unknown[] = [];
    client.on("message", (raw) => received.push(JSON.parse(raw.toString())));

    client.close();
    await new Promise((r) => setTimeout(r, 80));

    broadcastApplicationRowUpdate({ type: "application_row_update", stageId: STAGE_A, application: BASE_APP });

    await new Promise((r) => setTimeout(r, 80));
    expect(received).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// application_assignments_update
// ═══════════════════════════════════════════════════════════════════════════════

describe("application_assignments_update – delivery", () => {
  let wsUrl: string;
  let httpServer: http.Server;
  let wss: WebSocketServer;

  beforeAll(async () => {
    ({ httpServer, wss } = makeServer());
    wsUrl = await startServer(httpServer);
  });
  afterAll(() => stopServer(wss, httpServer));

  it("delivers assignment data with counts to a subscribed client", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = nextMessage(client);

    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    const msg = (await pending) as any;

    expect(msg.type).toBe("application_assignments_update");
    expect(msg.stageId).toBe(STAGE_A);
    expect(msg.assigned).toBe(2);
    expect(msg.unassigned).toBe(1);
    expect(msg.hasAssignments).toBe(true);
    expect(msg.assignments).toHaveLength(3);

    const alice = msg.assignments.find((a: any) => a.registrationId === "reg-00000001");
    expect(alice?.assignedDestinationId).toBe("dest-aaa");
    expect(alice?.assignedDestinationName).toBe("Madrid");

    const unassigned = msg.assignments.find((a: any) => a.registrationId === "reg-00000002");
    expect(unassigned?.assignedDestinationId).toBeNull();
    expect(unassigned?.assignedDestinationName).toBeNull();

    client.close();
  });

  it("carries hasAssignments: false when no assignments exist", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = nextMessage(client);

    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: [],
      assigned: 0,
      unassigned: 0,
      hasAssignments: false,
    });

    const msg = (await pending) as any;
    expect(msg.hasAssignments).toBe(false);
    expect(msg.assignments).toHaveLength(0);

    client.close();
  });

  it("does NOT deliver the event to a client on a different stage", async () => {
    const client = await subscribeClient(wsUrl, STAGE_B);
    const received: unknown[] = [];
    client.on("message", (raw) => received.push(JSON.parse(raw.toString())));

    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);

    client.close();
  });

  it("delivers to all simultaneous subscribers on the same stage", async () => {
    const [c1, c2] = await Promise.all([
      subscribeClient(wsUrl, STAGE_A),
      subscribeClient(wsUrl, STAGE_A),
    ]);
    const [p1, p2] = [nextMessage(c1), nextMessage(c2)];

    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    const [m1, m2] = (await Promise.all([p1, p2])) as any[];
    expect(m1.type).toBe("application_assignments_update");
    expect(m2.type).toBe("application_assignments_update");

    c1.close(); c2.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end scenario: admin edits a row then another admin runs assignment
// ═══════════════════════════════════════════════════════════════════════════════

describe("Combined scenario – row edit followed by assignment run", () => {
  let wsUrl: string;
  let httpServer: http.Server;
  let wss: WebSocketServer;

  beforeAll(async () => {
    ({ httpServer, wss } = makeServer());
    wsUrl = await startServer(httpServer);
  });
  afterAll(() => stopServer(wss, httpServer));

  it("client receives row update then assignment update in order, with correct data", async () => {
    const client = await subscribeClient(wsUrl, STAGE_A);
    const pending = collectMessages(client, 2);

    // Admin A saves a score change
    broadcastApplicationRowUpdate({
      type: "application_row_update",
      stageId: STAGE_A,
      application: { ...BASE_APP, averageResult: 5.5, score: 22.5 },
    });

    // Admin B immediately runs the assignment algorithm
    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    const [msg1, msg2] = (await pending) as any[];

    expect(msg1.type).toBe("application_row_update");
    expect(msg1.application.averageResult).toBe(5.5);
    expect(msg1.application.score).toBe(22.5);

    expect(msg2.type).toBe("application_assignments_update");
    expect(msg2.assigned).toBe(2);
    expect(msg2.assignments).toHaveLength(3);

    client.close();
  });

  it("a second observer on the same stage also receives both events", async () => {
    const observer = await subscribeClient(wsUrl, STAGE_A);
    const pending = collectMessages(observer, 2);

    broadcastApplicationRowUpdate({
      type: "application_row_update",
      stageId: STAGE_A,
      application: BASE_APP,
    });
    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    const msgs = (await pending) as any[];
    expect(msgs[0].type).toBe("application_row_update");
    expect(msgs[1].type).toBe("application_assignments_update");

    observer.close();
  });

  it("a client on a different stage receives neither event", async () => {
    const bystander = await subscribeClient(wsUrl, STAGE_B);
    const received: unknown[] = [];
    bystander.on("message", (raw) => received.push(JSON.parse(raw.toString())));

    broadcastApplicationRowUpdate({ type: "application_row_update", stageId: STAGE_A, application: BASE_APP });
    broadcastApplicationAssignmentsUpdate({
      type: "application_assignments_update",
      stageId: STAGE_A,
      assignments: ASSIGNMENTS,
      assigned: 2,
      unassigned: 1,
      hasAssignments: true,
    });

    await new Promise((r) => setTimeout(r, 120));
    expect(received).toHaveLength(0);

    bystander.close();
  });
});
