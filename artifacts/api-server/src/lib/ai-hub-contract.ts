export type AiHubAgent = "bowie" | "horus" | "ares" | "nadir" | "quebracho" | "qq";
export type AiHubCapability =
  | "chat"
  | "route"
  | "matching"
  | "diagnostics_review"
  | "orchestration"
  | "audio.create_soundtrack"
  | "indexing.embeddings"
  | "code_review";

export const AI_HUB_JOB_SCHEMA_VERSION = 1 as const;
export const AI_HUB_WIRING_FLAG = "AI_HUB_WIRING_ENABLED";

export const AI_HUB_CAPABILITY_OPTIONS = [
  { id: "chat", label: "Chat", agent: "bowie", active: false },
  { id: "route", label: "Routing", agent: "horus", active: false },
  { id: "matching", label: "Matching", agent: "ares", active: false },
  { id: "diagnostics_review", label: "Diagnostica e review", agent: "ares", active: false },
  { id: "orchestration", label: "Orchestrazione", agent: "ares", active: false },
  {
    id: "audio.create_soundtrack",
    label: "Crea colonna sonora",
    agent: "nadir",
    modeConfigRef: "nadir.audio_creation",
    active: false,
  },
  { id: "indexing.embeddings", label: "Indicizzazione ed embeddings", agent: "indexing-service", active: false },
  { id: "code_review", label: "Code review", agent: "quebracho", aliases: ["qq"], active: false },
] as const;

export interface AiHubJobEnvelope {
  schema_version: typeof AI_HUB_JOB_SCHEMA_VERSION;
  job_type: string;
  source_app: "bikerblog";
  request_id: string;
  correlation_id: string;
  conversation_id?: string | null;
  turn_id?: string | null;
  idempotency_key: string;
  requested_agent: AiHubAgent;
  capability: AiHubCapability;
  capability_label?: string | null;
  priority?: number;
  payload: Record<string, unknown>;
  retry: {
    max_attempts: number;
    backoff_ms: number;
    retryable_errors: readonly string[];
  };
  archive: { required: boolean; mode: "ai_hub_archive" };
}

export function canonicalAgent(agent: AiHubAgent): Exclude<AiHubAgent, "qq"> {
  return agent === "qq" ? "quebracho" : agent;
}

export function isAiHubWiringEnabled(): boolean {
  return process.env[AI_HUB_WIRING_FLAG]?.trim().toLowerCase() === "true";
}
