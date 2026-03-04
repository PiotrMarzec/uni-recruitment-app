/**
 * Integration test for the live dashboard real-time update flow.
 *
 * Verifies that when a student changes their registration details (name, etc.),
 * a connected admin dashboard WebSocket client receives a `registration_step_update`
 * message with the updated data — without requiring a page reload.
 *
 * The test wires up the same setup that src/server.ts performs at startup:
 *   1. Creates a real WebSocket server using the same `setupWebSocketServer` and
 *      `broadcastToStage` from websocket/server.ts.
 *   2. Registers `broadcastToStage` in `global.__broadcastToStage` — exactly as
 *      server.ts does — so that the events.ts helper (used by API routes) reaches
 *      the same subscriptions Map.
 *   3. Connects a WebSocket client and subscribes to a stage, simulating the admin
 *      dashboard.
 *   4. Calls `broadcastRegistrationStepUpdate` from events.ts, simulating the step
 *      API route handler.
 *   5. Asserts the client received the correct message.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer, broadcastToStage } from "../server";
import { broadcastRegistrationStepUpdate } from "../events";

const STAGE_ID = "test-stage-live-dashboard";

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
