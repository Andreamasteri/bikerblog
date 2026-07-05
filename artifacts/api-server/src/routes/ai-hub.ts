import { Router, type IRouter } from "express";
import { AiHubHealthResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Scheletro sottile del proxy verso l'AI Hub su TC (Fase 2c economy, Task
// #196, Step 7). NON inoltra ancora la chat: quella migrazione (tool-loop,
// SSE, cache, fallback gateway — vedi docs/ai-hub-parity-contract.md) è
// Fase 2b (Task #193). Qui c'è solo un check di raggiungibilità, così l'AI
// Hub ha già un endpoint Replit pronto da riempire senza dover ripartire da
// zero sul routing.
const AI_HUB_HEALTH_TIMEOUT_MS = 3_000;

function isAiHubConfigured(): boolean {
  return Boolean(process.env["AI_HUB_URL"]?.trim() && process.env["HUB_GATE_TOKEN"]);
}

router.get("/ai-hub/health", async (req, res) => {
  const baseUrl = process.env["AI_HUB_URL"]?.trim();
  const gateToken = process.env["HUB_GATE_TOKEN"];

  if (!baseUrl || !gateToken || !isAiHubConfigured()) {
    res.json(AiHubHealthResponse.parse({ configured: false, reachable: null }));
    return;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/capabilities`, {
      headers: { "X-Hub-Gate-Token": gateToken },
      signal: AbortSignal.timeout(AI_HUB_HEALTH_TIMEOUT_MS),
    });
    res.json(AiHubHealthResponse.parse({ configured: true, reachable: response.ok }));
  } catch (error) {
    req.log.warn({ err: error }, "ai-hub health check failed");
    res.json(AiHubHealthResponse.parse({ configured: true, reachable: false }));
  }
});

export default router;
