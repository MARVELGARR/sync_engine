import pino from "pino";
import { config } from "../config/env.js";

const isDev = config.nodeEnv !== "production";

export const logger = pino({
    level: isDev ? "debug" : "info",
    transport: isDev
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
});

export const persistLogger = logger.child({ service: "persist-worker" });
export const streamLogger = logger.child({ service: "stream-consumer" });
export const snapshotLogger = logger.child({ service: "snapshot-writer" });
