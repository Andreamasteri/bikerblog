import pino from "pino";
import { mkdirSync } from "fs";
import { resolve } from "path";

const isProduction = process.env.NODE_ENV === "production";

const LOG_FILE = resolve(process.cwd(), "../../logs/api-server.log");
mkdirSync(resolve(process.cwd(), "../../logs"), { recursive: true });

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
    ],
  },
  pino.transport({
    targets: [
      ...(isProduction
        ? [{ target: "pino/file", options: { destination: 1 }, level: "info" }]
        : [{ target: "pino-pretty", options: { colorize: true }, level: "info" }]),
      {
        target: "pino/file",
        options: { destination: LOG_FILE },
        level: "info",
      },
    ],
  })
);
