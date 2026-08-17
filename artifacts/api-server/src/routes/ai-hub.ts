import { Router, type IRouter } from "express";
import { AiHubHealthResponse } from "@workspace/api-zod";
import { AI_HUB_CAPABILITY_OPTIONS, type AiHubAgent, type AiHubCapability } from "../lib/ai-hub-contract";
import { submitAiHubJob } from "../lib/ai-hub-job-adapter";

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

router.get("/ai-hub/capabilities", (_req, res) => {
  // Static registry only: this endpoint never contacts AI-Hub.
  res.json({
    featureFlag: "AI_HUB_WIRING_ENABLED",
    enabled: false,
    capabilities: AI_HUB_CAPABILITY_OPTIONS,
  });
});

router.post("/ai-hub/jobs", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const capability = body.capability as AiHubCapability;
  const requestedAgent = body.requested_agent as AiHubAgent;
  const option = AI_HUB_CAPABILITY_OPTIONS.find((item) => item.id === capability);
  if (!option || (option.agent !== requestedAgent && !(option.aliases ?? []).includes(requestedAgent))) {
    res.status(400).json({ error: "capability_agent_mismatch" });
    return;
  }

  const required = ["job_type", "request_id", "correlation_id", "idempotency_key"];
  if (required.some((key) => typeof body[key] !== "string" || !(body[key] as string).trim())) {
    res.status(400).json({ error: "job_identity_fields_required" });
    return;
  }

  const result = await submitAiHubJob({
    job_type: body.job_type as string,
    request_id: body.request_id as string,
    correlation_id: body.correlation_id as string,
    conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : null,
    turn_id: typeof body.turn_id === "string" ? body.turn_id : null,
    idempotency_key: body.idempotency_key as string,
    requested_agent: requestedAgent,
    capability,
    capability_label: option.label,
    payload: body.payload && typeof body.payload === "object"
      ? body.payload as Record<string, unknown>
      : {},
  });

  if (!result.ok) {
    res.status(result.status === "disabled" ? 503 : 502).json(result);
    return;
  }
  res.status(202).json(result);
});

export default router;
