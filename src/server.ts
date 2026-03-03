import { createServer } from "http";
import { parse } from "url";
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
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Set up WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  setupWebSocketServer(wss);

  // Handle WebSocket upgrade for /api/ws endpoint
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url!);

    if (pathname === "/api/ws") {
      wss.handleUpgrade(request, socket as import("net").Socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Environment: ${dev ? "development" : "production"}`);
  });

  // Start background jobs
  startJobs();
});
