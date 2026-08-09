import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { config } from "./config/env.js";
import { syncLogger } from "./utils/logger.js";
import { verifyToken, authorizeUser } from "./auth/auth.js";
import { connectRedis, disconnectRedis } from "./redis/redis.manager.js";
import { getOrCreateRoom, destroyAllRooms, getUserConnectionCount, type ClientInfo } from "./rooms/document.room.js";
import { closePool } from "./db/snapshot.loader.js";

// ─── HTTP Server ────────────────────────────────────────────────
const server = http.createServer((_req, res) => {
    // Simple health check for non-WebSocket requests
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "sync-service", nodeId: config.nodeId }));
});

// ─── WebSocket Server ───────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws: WebSocket, req: http.IncomingMessage) => {
    // Parse query parameters: docId and token
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const docId = url.searchParams.get("docId");
    const token = url.searchParams.get("token");

    // ── Validate required params ──────────────────────────────
    if (!docId || !token) {
        syncLogger.warn("WebSocket connection rejected: missing docId or token");
        ws.close(4000, "Missing docId or token");
        return;
    }

    // ── Verify JWT locally ────────────────────────────────────
    let jwtPayload;
    try {
        jwtPayload = verifyToken(token);
    } catch {
        syncLogger.warn({ docId }, "WebSocket connection rejected: invalid JWT");
        ws.close(4001, "Invalid or expired token");
        return;
    }

    // ── Authorize via user-service ────────────────────────────
    const authResult = await authorizeUser(token, docId);
    if (!authResult.authorized || !authResult.permission) {
        syncLogger.warn(
            { docId, userId: jwtPayload.sub },
            "WebSocket connection rejected: unauthorized"
        );
        ws.close(4003, "Access denied to this document");
        return;
    }

    // ── Enforce global user connection limit (max 10) ─────────
    const userConnCount = getUserConnectionCount(jwtPayload.sub);
    if (userConnCount >= 10) {
        syncLogger.warn(
            { docId, userId: jwtPayload.sub, userConnCount },
            "WebSocket connection rejected: user connection limit exceeded (max 10)"
        );
        ws.close(4006, "User active connection limit exceeded");
        return;
    }

    const room = await getOrCreateRoom(docId);

    // ── Enforce room connection limit (max 50) ────────────────
    if (room.clients.size >= 50) {
        syncLogger.warn(
            { docId, userId: jwtPayload.sub, roomSize: room.clients.size },
            "WebSocket connection rejected: room connection limit exceeded (max 50)"
        );
        ws.close(4005, "Document room connection limit exceeded");
        return;
    }

    // ── Join the Document Room ────────────────────────────────
    syncLogger.info(
        { docId, userId: jwtPayload.sub, permission: authResult.permission },
        "WebSocket connection authorized"
    );

    const clientInfo: ClientInfo = {
        ws,
        userId: jwtPayload.sub,
        displayName: jwtPayload.displayName,
        permission: authResult.permission,
    };

    room.addClient(clientInfo);

    // ── Handle incoming messages ──────────────────────────────
    ws.on("message", (data: Buffer) => {
        room.handleMessage(ws, new Uint8Array(data));
    });

    // ── Handle disconnect ─────────────────────────────────────
    ws.on("close", () => {
        room.removeClient(ws);
        syncLogger.info(
            { docId, userId: jwtPayload.sub },
            "WebSocket disconnected"
        );
    });

    // ── Handle errors ─────────────────────────────────────────
    ws.on("error", (err) => {
        syncLogger.error({ err, docId, userId: jwtPayload.sub }, "WebSocket error");
        room.removeClient(ws);
    });
});

// ─── Heartbeat (Ping/Pong) ──────────────────────────────────────
const aliveClients = new WeakSet<WebSocket>();

wss.on("connection", (ws) => {
    aliveClients.add(ws);
    ws.on("pong", () => {
        aliveClients.add(ws);
    });
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!aliveClients.has(ws)) {
            syncLogger.debug("Terminating dead WebSocket connection (no pong)");
            ws.terminate();
            return;
        }
        aliveClients.delete(ws);
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    });
}, config.pingIntervalMs);

wss.on("close", () => {
    clearInterval(heartbeatInterval);
});

// ─── Start ──────────────────────────────────────────────────────
async function start(): Promise<void> {
    try {
        await connectRedis();

        server.listen(config.port, () => {
            syncLogger.info(
                `⚡ Sync Service [${config.nodeId}] running on port ${config.port}`
            );
        });
    } catch (err) {
        syncLogger.error({ err }, "Failed to start Sync Service");
        process.exit(1);
    }
}

// ─── Graceful Shutdown ──────────────────────────────────────────
async function shutdown(): Promise<void> {
    syncLogger.info("Shutting down Sync Service...");
    clearInterval(heartbeatInterval);

    // Close all WebSocket connections
    wss.clients.forEach((ws) => {
        ws.close(1001, "Server shutting down");
    });

    await destroyAllRooms();
    await disconnectRedis();
    await closePool();

    server.close(() => {
        syncLogger.info("Sync Service shut down cleanly");
        process.exit(0);
    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
