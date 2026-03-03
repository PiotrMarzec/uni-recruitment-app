import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./lib/websocket/server";
import { startJobs } from "./lib/jobs";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error("Error handling request:", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Set up WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  setupWebSocketServer(wss);

  const nextUpgrade = app.getUpgradeHandler();

  // Handle WebSocket upgrade for /api/ws endpoint; forward everything else to Next.js (e.g. HMR)
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url!, `http://${hostname}`);

    if (pathname === "/api/ws") {
      wss.handleUpgrade(request, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      nextUpgrade(request, socket, head);
    }
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);
  });

  // Start background jobs
  startJobs();
});
