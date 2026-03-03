import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";

// Map of stageId -> Set of connected WebSocket clients
const subscriptions = new Map<string, Set<WebSocket>>();

export function setupWebSocketServer(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let subscribedStageId: string | null = null;

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "subscribe" && typeof message.stageId === "string") {
          // Unsubscribe from previous stage if any
          if (subscribedStageId) {
            const clients = subscriptions.get(subscribedStageId);
            clients?.delete(ws);
          }

          subscribedStageId = message.stageId;
          const stageId: string = message.stageId;

          if (!subscriptions.has(stageId)) {
            subscriptions.set(stageId, new Set());
          }
          subscriptions.get(stageId)!.add(ws);

          // Send confirmation
          ws.send(JSON.stringify({ type: "subscribed", stageId: subscribedStageId }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (subscribedStageId) {
        const clients = subscriptions.get(subscribedStageId);
        clients?.delete(ws);
        if (clients?.size === 0) {
          subscriptions.delete(subscribedStageId);
        }
      }
    });

    ws.on("error", () => {
      // Silently handle errors
    });
  });
}

export function broadcastToStage(
  stageId: string,
  data: object
): void {
  const clients = subscriptions.get(stageId);
  if (!clients || clients.size === 0) return;

  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        // Client may have disconnected
      }
    }
  }
}
