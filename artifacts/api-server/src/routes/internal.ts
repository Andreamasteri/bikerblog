import { Router, type IRouter } from "express";
import express from "express";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const router: IRouter = Router();

const INBOX_TOKEN = process.env["INBOX_TOKEN"];
const INBOX_DIR = path.resolve(__dirname, "..", "..", "..", "..", "inbox");

router.post(
  "/_internal/receive-transcript",
  express.text({ type: "*/*", limit: "100mb" }),
  async (req, res): Promise<void> => {
    const auth = req.headers.authorization;
    if (!INBOX_TOKEN || auth !== `Bearer ${INBOX_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = req.body as string;
    if (!body || typeof body !== "string" || body.trim().length === 0) {
      res.status(400).json({ error: "empty body" });
      return;
    }

    mkdirSync(INBOX_DIR, { recursive: true });
    const outPath = path.join(INBOX_DIR, "bikerlink-chat-full.jsonl");
    writeFileSync(outPath, body, "utf-8");

    const lineCount = body.split("\n").filter(Boolean).length;
    req.log.info({ lines: lineCount, outPath }, "Transcript received and saved");
    res.json({ ok: true, lines: lineCount });
  },
);

export default router;
