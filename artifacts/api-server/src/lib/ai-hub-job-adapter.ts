import {
  AI_HUB_JOB_SCHEMA_VERSION,
  canonicalAgent,
  isAiHubWiringEnabled,
  type AiHubAgent,
  type AiHubCapability,
  type AiHubJobEnvelope,
} from "./ai-hub-contract";

export type AiHubAdapterResult =
  | { ok: true; status: "submitted"; jobId: string }
  | { ok: false; status: "disabled" | "error"; error: string };

const TARGETS: Readonly<Partial<Record<AiHubCapability, AiHubAgent>>> = {
  chat: "bowie",
  route: "horus",
  matching: "ares",
  diagnostics_review: "ares",
  orchestration: "ares",
  "audio.create_soundtrack": "nadir",
  code_review: "quebracho",
};

export async function submitAiHubJob(
  request: Omit<AiHubJobEnvelope, "schema_version" | "source_app" | "retry" | "archive"> & {
    retry?: AiHubJobEnvelope["retry"];
    archive?: AiHubJobEnvelope["archive"];
  },
): Promise<AiHubAdapterResult> {
  if (!isAiHubWiringEnabled()) {
    return { ok: false, status: "disabled", error: "ai_hub_wiring_disabled" };
  }

  const requestedAgent = canonicalAgent(request.requested_agent);
  if (request.capability === "indexing.embeddings") {
    return { ok: false, status: "error", error: "indexing_service_is_separate" };
  }
  const target = TARGETS[request.capability];
  if (!target || canonicalAgent(target) !== requestedAgent) {
    return { ok: false, status: "error", error: "capability_agent_mismatch" };
  }

  const baseUrl = process.env.AI_HUB_CONTROL_URL?.trim().replace(/\/+$/, "");
  const token = process.env.AI_HUB_BEARER_TOKEN?.trim();
  if (!baseUrl || !token) {
    return { ok: false, status: "error", error: "ai_hub_control_credentials_missing" };
  }

  const envelope: AiHubJobEnvelope = {
    schema_version: AI_HUB_JOB_SCHEMA_VERSION,
    source_app: "bikerblog",
    retry: request.retry ?? {
      max_attempts: 2,
      backoff_ms: 1000,
      retryable_errors: ["worker_unavailable", "temporary_network_error", "timeout"],
    },
    archive: request.archive ?? { required: true, mode: "ai_hub_archive" },
    ...request,
    requested_agent: requestedAgent,
  };

  try {
    const response = await fetch(baseUrl + "/v1/jobs", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "Idempotency-Key": envelope.idempotency_key,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { ok: false, status: "error", error: "ai_hub_http_" + response.status };
    }
    const body = (await response.json()) as { job_id?: string };
    return body.job_id
      ? { ok: true, status: "submitted", jobId: body.job_id }
      : { ok: false, status: "error", error: "ai_hub_job_id_missing" };
  } catch {
    // TC indisponibile: errore controllato, senza fallback automatico.
    return { ok: false, status: "error", error: "ai_hub_unavailable" };
  }
}
