import pino from "pino";
import { config } from "../config/env.js";

export const logger = pino({
    level: config.nodeEnv === "production" ? "info" : "debug",
    transport:
        config.nodeEnv !== "production"
            ? { target: "pino-pretty", options: { colorize: true } }
            : undefined,
});

export const authLogger = logger.child({ service: "auth" });
export const userLogger = logger.child({ service: "user" });
export const docLogger = logger.child({ service: "document" });
