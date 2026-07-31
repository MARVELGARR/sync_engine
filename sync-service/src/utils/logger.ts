import pino from "pino";
import { config } from "../config/env.js";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
    level: isDev ? "debug" : "info",
    transport: isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
});

export const syncLogger = logger.child({ service: "sync", nodeId: config.nodeId });
export const roomLogger = logger.child({ service: "room", nodeId: config.nodeId });
export const redisLogger = logger.child({ service: "redis", nodeId: config.nodeId });
