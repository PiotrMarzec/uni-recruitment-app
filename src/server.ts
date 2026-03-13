import { createServer, IncomingMessage } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWebSocketServer, broadcastToStage } from "./lib/websocket/server";
import { startJobs } from "./lib/jobs";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./db";
import { db } from "./db";
import { admins } from "./db/schema";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { AdminSessionData } from "./lib/auth/session";
import path from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your .env file or environment before starting the application.`
    );
  }
  return value;
}

const sessionOptions = {
  password: requireEnv("SESSION_SECRET"),
  cookieName: "session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    })
  );
}

async function isAdminUpgradeRequest(request: IncomingMessage): Promise<boolean> {
  try {
    const parsed = parseCookies(request.headers["cookie"]);
    const cookieStore = {
      get: (name: string) => {
        const value = parsed[name];
        return value !== undefined ? { name, value } : undefined;
      },
    };
    const session = await getIronSession<AdminSessionData>(
      cookieStore as any,
      sessionOptions
    );
    if (!session.isAdmin || !session.userId) return false;
    const [adminRecord] = await db
      .select({ disabledAt: admins.disabledAt })
      .from(admins)
      .where(eq(admins.userId, session.userId));
    return !!(adminRecord && !adminRecord.disabledAt);
  } catch {
    return false;
  }
}

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function runMigrations() {
  console.log("[Migrations] Running pending migrations...");
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, "db/migrations") });
  console.log("[Migrations] All migrations applied.");
}

runMigrations().then(() => app.prepare()).then(() => {
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

  // Register broadcast function in global so Next.js API routes (which run in a
  // separate module context) can call it and reach the actual connected clients.
  (global as any).__broadcastToStage = broadcastToStage;

  const nextUpgrade = app.getUpgradeHandler();

  // Handle WebSocket upgrade for /api/ws endpoint; forward everything else to Next.js (e.g. HMR)
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url!, `http://${hostname}`);

    if (pathname === "/api/ws") {
      isAdminUpgradeRequest(request).then((isAdmin) => {
        if (!isAdmin) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket as import("net").Socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }).catch(() => {
        socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
        socket.destroy();
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
